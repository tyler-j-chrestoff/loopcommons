"""Tests for arena trace consolidation asset."""

import json
import tempfile
from pathlib import Path

import polars as pl
import pytest

from loopcommons_pipeline.assets.arena_consolidation import (
    _read_arena_traces,
    _flatten_run_events,
    _flatten_choice_points,
    _RUNS_SCHEMA,
    _CHOICE_POINTS_SCHEMA,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

HEADER = {
    "type": "run:header",
    "runId": "path-1-trial-1",
    "pathId": "path-1",
    "startedAt": "2026-03-20T10:00:00Z",
    "startingStateHash": "abc123",
    "pathLabel": "inspect → search → act",
}

CHOICE_POINT = {
    "type": "choice:point",
    "encounterId": "e1",
    "offeredTools": ["inspect", "act"],
    "currentTools": [],
    "selectedTool": "inspect",
    "droppedTool": None,
    "confidenceScore": 0.85,
    "selfAssessment": "No tools yet.",
    "acquisitionReasoning": "Inspect gives visibility.",
    "sacrificeReasoning": None,
    "forwardModel": "Will observe first.",
    "memoryStateDump": "empty",
    "stateHash": "hash1",
    "chainHash": "chain1",
    "promptRendered": "Choose...",
    "responseRaw": "<tool>inspect</tool>",
}

STEP = {
    "type": "encounter:step",
    "encounterId": "e1",
    "stepIndex": 0,
    "toolName": "inspect",
    "toolInput": {"target": "service:data-ingest"},
    "toolOutput": "Running.",
    "durationMs": 500,
}

COMPLETE = {
    "type": "run:complete",
    "completedAt": "2026-03-20T10:01:00Z",
    "isVictory": True,
    "finalScore": 0.8,
    "e4ApproachCategory": "observe-first",
}

DEATH = {
    "type": "run:death",
    "completedAt": "2026-03-20T10:01:00Z",
    "cause": "iteration_limit",
    "details": "Exceeded 20 steps",
    "lastEncounterId": "e2",
}


def _write_run(tmpdir: Path, experiment_id: str, run_id: str, events: list[dict]) -> None:
    exp_dir = tmpdir / experiment_id
    exp_dir.mkdir(parents=True, exist_ok=True)
    path = exp_dir / f"{run_id}.jsonl"
    path.write_text("\n".join(json.dumps(e) for e in events) + "\n")


# ---------------------------------------------------------------------------
# Tests: _read_arena_traces
# ---------------------------------------------------------------------------

class TestReadArenaTraces:
    def test_reads_all_experiments(self, tmp_path: Path):
        _write_run(tmp_path, "exp-1", "run-1", [HEADER, COMPLETE])
        _write_run(tmp_path, "exp-2", "run-2", [HEADER, COMPLETE])

        results = _read_arena_traces(tmp_path)
        assert len(results) == 2
        assert {r["experiment_id"] for r in results} == {"exp-1", "exp-2"}

    def test_attaches_metadata(self, tmp_path: Path):
        _write_run(tmp_path, "exp-1", "run-1", [HEADER, STEP, COMPLETE])

        results = _read_arena_traces(tmp_path)
        assert results[0]["experiment_id"] == "exp-1"
        assert results[0]["run_id"] == "run-1"
        assert len(results[0]["events"]) == 3

    def test_returns_empty_if_dir_missing(self, tmp_path: Path):
        results = _read_arena_traces(tmp_path / "nonexistent")
        assert results == []

    def test_skips_non_jsonl(self, tmp_path: Path):
        exp_dir = tmp_path / "exp-1"
        exp_dir.mkdir()
        (exp_dir / "notes.txt").write_text("not a trace")
        _write_run(tmp_path, "exp-1", "run-1", [HEADER, COMPLETE])

        results = _read_arena_traces(tmp_path)
        assert len(results) == 1


# ---------------------------------------------------------------------------
# Tests: _flatten_run_events
# ---------------------------------------------------------------------------

class TestFlattenRunEvents:
    def test_extracts_victory_run(self, tmp_path: Path):
        traces = [
            {"experiment_id": "exp-1", "run_id": "run-1", "events": [HEADER, STEP, COMPLETE]}
        ]
        df = _flatten_run_events(traces)
        assert len(df) == 1
        assert df["run_id"][0] == "run-1"
        assert df["is_victory"][0] is True
        assert df["is_dead"][0] is False
        assert df["step_count"][0] == 1

    def test_extracts_death_run(self, tmp_path: Path):
        traces = [
            {"experiment_id": "exp-1", "run_id": "run-1", "events": [HEADER, STEP, DEATH]}
        ]
        df = _flatten_run_events(traces)
        assert df["is_dead"][0] is True
        assert df["death_cause"][0] == "iteration_limit"

    def test_counts_choice_points(self):
        traces = [
            {
                "experiment_id": "exp-1",
                "run_id": "run-1",
                "events": [HEADER, CHOICE_POINT, STEP, COMPLETE],
            }
        ]
        df = _flatten_run_events(traces)
        assert df["choice_point_count"][0] == 1

    def test_empty_traces(self):
        df = _flatten_run_events([])
        assert len(df) == 0
        assert set(df.columns) == set(_RUNS_SCHEMA.keys())


# ---------------------------------------------------------------------------
# Tests: _flatten_choice_points
# ---------------------------------------------------------------------------

class TestFlattenChoicePoints:
    def test_extracts_choice_point_fields(self):
        traces = [
            {
                "experiment_id": "exp-1",
                "run_id": "run-1",
                "events": [HEADER, CHOICE_POINT, COMPLETE],
            }
        ]
        df = _flatten_choice_points(traces)
        assert len(df) == 1
        assert df["selected_tool"][0] == "inspect"
        assert df["confidence_score"][0] == 0.85
        assert df["self_assessment"][0] == "No tools yet."

    def test_multiple_choice_points(self):
        cp2 = {**CHOICE_POINT, "encounterId": "e2", "selectedTool": "search"}
        traces = [
            {
                "experiment_id": "exp-1",
                "run_id": "run-1",
                "events": [HEADER, CHOICE_POINT, cp2, COMPLETE],
            }
        ]
        df = _flatten_choice_points(traces)
        assert len(df) == 2

    def test_no_choice_points(self):
        traces = [{"experiment_id": "exp-1", "run_id": "run-1", "events": [HEADER, COMPLETE]}]
        df = _flatten_choice_points(traces)
        assert len(df) == 0
        assert set(df.columns) == set(_CHOICE_POINTS_SCHEMA.keys())

    def test_preserves_reasoning_text(self):
        traces = [
            {
                "experiment_id": "exp-1",
                "run_id": "run-1",
                "events": [HEADER, CHOICE_POINT, COMPLETE],
            }
        ]
        df = _flatten_choice_points(traces)
        assert df["acquisition_reasoning"][0] == "Inspect gives visibility."
        assert df["forward_model"][0] == "Will observe first."
