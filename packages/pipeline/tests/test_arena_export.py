"""Tests for arena training data export asset."""

import hashlib
import json
from pathlib import Path

import polars as pl
import pytest

from loopcommons_pipeline.assets.arena_export import (
    _build_reasoning_pairs,
    _build_divergence_pairs,
    _export_jsonl_with_checksum,
)


# ---------------------------------------------------------------------------
# Fixtures — choice point rows as they'd appear in Parquet
# ---------------------------------------------------------------------------

def _cp(run_id: str, encounter_id: str, selected: str, current: list[str],
        reasoning: str = "default reasoning", confidence: float = 0.8) -> dict:
    return {
        "experiment_id": "exp-1",
        "run_id": run_id,
        "encounter_id": encounter_id,
        "offered_tools": json.dumps(["inspect", "act", "search", "model"]),
        "current_tools": json.dumps(current),
        "selected_tool": selected,
        "dropped_tool": None,
        "confidence_score": confidence,
        "self_assessment": f"I have {current}",
        "acquisition_reasoning": reasoning,
        "sacrifice_reasoning": None,
        "forward_model": "Looking ahead.",
        "memory_state_dump": "state",
        "state_hash": f"hash-{run_id}-{encounter_id}",
        "chain_hash": f"chain-{run_id}",
        "prompt_rendered": "Choose a tool.",
        "response_raw": f"<tool>{selected}</tool>",
    }


def _run(run_id: str, path_id: str, approach: str = "observe-first",
         is_victory: bool = True, final_tools: str = "inspect,search") -> dict:
    return {
        "experiment_id": "exp-1",
        "run_id": run_id,
        "path_id": path_id,
        "path_label": path_id,
        "started_at": "2026-03-20T10:00:00Z",
        "completed_at": "2026-03-20T10:01:00Z",
        "is_victory": is_victory,
        "is_dead": not is_victory,
        "death_cause": "iteration_limit" if not is_victory else None,
        "death_details": None,
        "step_count": 5,
        "choice_point_count": 2,
        "e4_approach_category": approach,
        "final_score": 0.8 if is_victory else None,
        "starting_state_hash": "genesis",
    }


# ---------------------------------------------------------------------------
# Tests: _build_reasoning_pairs
# ---------------------------------------------------------------------------

class TestBuildReasoningPairs:
    def test_pairs_same_encounter_different_context(self):
        """Same choice point, different developmental context → training pair."""
        cps = [
            _cp("run-1", "e2", "search", ["inspect"], "Need search for patterns"),
            _cp("run-2", "e2", "inspect", ["act"], "Need inspect to understand system"),
        ]
        cp_df = pl.DataFrame(cps)
        pairs = _build_reasoning_pairs(cp_df)

        assert len(pairs) == 1
        pair = pairs[0]
        assert pair["encounter_id"] == "e2"
        assert pair["agent_a_selected"] != pair["agent_b_selected"]
        assert pair["agent_a_reasoning"] != pair["agent_b_reasoning"]

    def test_no_pairs_single_run(self):
        cps = [_cp("run-1", "e2", "search", ["inspect"])]
        cp_df = pl.DataFrame(cps)
        pairs = _build_reasoning_pairs(cp_df)
        assert len(pairs) == 0

    def test_multiple_encounters_produce_separate_pairs(self):
        cps = [
            _cp("run-1", "e1", "inspect", ["search"]),
            _cp("run-2", "e1", "act", ["model"]),
            _cp("run-1", "e2", "search", ["inspect"]),
            _cp("run-2", "e2", "model", ["act"]),
        ]
        cp_df = pl.DataFrame(cps)
        pairs = _build_reasoning_pairs(cp_df)
        assert len(pairs) == 2

    def test_empty_input(self):
        from loopcommons_pipeline.assets.arena_consolidation import _CHOICE_POINTS_SCHEMA
        cp_df = pl.DataFrame(schema=_CHOICE_POINTS_SCHEMA)
        pairs = _build_reasoning_pairs(cp_df)
        assert len(pairs) == 0


# ---------------------------------------------------------------------------
# Tests: _build_divergence_pairs
# ---------------------------------------------------------------------------

class TestBuildDivergencePairs:
    def test_pairs_different_paths_same_approach(self):
        """Same final approach but different paths → divergence pair."""
        runs = [
            _run("run-1", "path-1", "observe-first"),
            _run("run-2", "path-2", "observe-first"),
        ]
        runs_df = pl.DataFrame(runs)
        pairs = _build_divergence_pairs(runs_df)

        assert len(pairs) == 1
        pair = pairs[0]
        assert pair["shared_approach"] == "observe-first"
        assert pair["path_a"] != pair["path_b"]

    def test_no_pairs_unique_approaches(self):
        runs = [
            _run("run-1", "path-1", "observe-first"),
            _run("run-2", "path-2", "act-first"),
        ]
        runs_df = pl.DataFrame(runs)
        pairs = _build_divergence_pairs(runs_df)
        assert len(pairs) == 0

    def test_empty_input(self):
        from loopcommons_pipeline.assets.arena_consolidation import _RUNS_SCHEMA
        runs_df = pl.DataFrame(schema=_RUNS_SCHEMA)
        pairs = _build_divergence_pairs(runs_df)
        assert len(pairs) == 0


# ---------------------------------------------------------------------------
# Tests: _export_jsonl_with_checksum
# ---------------------------------------------------------------------------

class TestExportJsonl:
    def test_writes_jsonl_and_checksum(self, tmp_path: Path):
        records = [{"a": 1, "b": "hello"}, {"a": 2, "b": "world"}]
        path, count, checksum = _export_jsonl_with_checksum(records, tmp_path, "test_data")

        assert path.exists()
        assert path.suffix == ".jsonl"
        assert count == 2

        # Verify checksum
        content = path.read_bytes()
        expected = hashlib.sha256(content).hexdigest()
        assert checksum == expected

        # Verify sidecar
        sidecar = path.with_suffix(".jsonl.sha256")
        assert sidecar.exists()
        assert checksum in sidecar.read_text()

    def test_empty_records(self, tmp_path: Path):
        path, count, checksum = _export_jsonl_with_checksum([], tmp_path, "empty")
        assert count == 0
        assert path.exists()
