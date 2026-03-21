"""Tests for tournament consolidation asset."""

import json
from pathlib import Path

import polars as pl
import pytest

from loopcommons_pipeline.assets.tournament_consolidation import (
    _read_tournament_data,
    _flatten_generations,
    _flatten_agents,
    _GENERATIONS_SCHEMA,
    _AGENTS_SCHEMA,
)


# ---------------------------------------------------------------------------
# Fixtures — tournament data as it appears in generations.jsonl
# ---------------------------------------------------------------------------

def _gen_record(generation: int, agents: list[dict], fitness: list[dict],
                survivors: list[str] | None = None,
                mutations: list[dict] | None = None,
                crossovers: list[dict] | None = None,
                duration_ms: int = 100) -> dict:
    return {
        "type": "generation",
        "generation": generation,
        "populationSize": len(agents),
        "agents": agents,
        "fitness": fitness,
        "survivors": survivors or [a["id"] for a in agents[:2]],
        "mutations": mutations or [],
        "crossovers": crossovers or [],
        "durationMs": duration_ms,
    }


def _agent(agent_id: str, tools: list[str], origin: str = "seed",
           parent_ids: list[str] | None = None,
           identity_hash: str = "hash-abc") -> dict:
    return {
        "id": agent_id,
        "tools": tools,
        "origin": origin,
        "parentIds": parent_ids or [],
        "identity": identity_hash,
    }


def _fitness(agent_id: str, score: float = 0.55,
             completion: float = 0.33, mean_score: float = 0.25,
             mean_steps: int = 3, survival: float = 1.0,
             cost: float = 0.006) -> dict:
    return {
        "agentId": agent_id,
        "fitnessScore": score,
        "metrics": {
            "completionRate": completion,
            "meanScore": mean_score,
            "meanSteps": mean_steps,
            "survivalRate": survival,
            "totalCost": cost,
        },
    }


def _tournament_complete(tournament_id: str = "t-1",
                         generations_run: int = 3,
                         best_fitness: float = 0.57,
                         winner_id: str = "a-1",
                         winner_tools: list[str] | None = None) -> dict:
    return {
        "type": "tournament_complete",
        "tournamentId": tournament_id,
        "generationsRun": generations_run,
        "bestFitness": best_fitness,
        "winnerId": winner_id,
        "winnerTools": winner_tools or ["search"],
        "winnerOrigin": "mutation",
        "startedAt": "2026-03-20T10:00:00Z",
        "completedAt": "2026-03-20T10:05:00Z",
    }


def _write_generations_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for record in records:
            f.write(json.dumps(record) + "\n")


# ---------------------------------------------------------------------------
# Tests: _read_tournament_data
# ---------------------------------------------------------------------------

class TestReadTournamentData:
    def test_reads_generations_jsonl(self, tmp_path: Path):
        agents = [_agent("a-1", ["inspect", "act"]), _agent("a-2", ["search"])]
        fitness_list = [_fitness("a-1"), _fitness("a-2", score=0.60)]
        gen0 = _gen_record(0, agents, fitness_list)
        complete = _tournament_complete()

        _write_generations_jsonl(tmp_path / "generations.jsonl", [gen0, complete])

        data = _read_tournament_data(tmp_path)
        assert len(data["generations"]) == 1
        assert data["generations"][0]["generation"] == 0
        assert data["complete"] is not None
        assert data["complete"]["tournamentId"] == "t-1"

    def test_empty_directory(self, tmp_path: Path):
        data = _read_tournament_data(tmp_path)
        assert data["generations"] == []
        assert data["complete"] is None

    def test_missing_directory(self, tmp_path: Path):
        data = _read_tournament_data(tmp_path / "nonexistent")
        assert data["generations"] == []
        assert data["complete"] is None

    def test_skips_malformed_lines(self, tmp_path: Path):
        gen_path = tmp_path / "generations.jsonl"
        gen_path.parent.mkdir(parents=True, exist_ok=True)
        with open(gen_path, "w") as f:
            f.write("not valid json\n")
            f.write(json.dumps(_gen_record(0, [_agent("a-1", ["act"])],
                                           [_fitness("a-1")])) + "\n")
            f.write("\n")  # empty line
        data = _read_tournament_data(tmp_path)
        assert len(data["generations"]) == 1


# ---------------------------------------------------------------------------
# Tests: _flatten_generations
# ---------------------------------------------------------------------------

class TestFlattenGenerations:
    def test_one_generation(self):
        agents = [_agent("a-1", ["inspect"]), _agent("a-2", ["act", "search"])]
        fitness_list = [_fitness("a-1", score=0.55), _fitness("a-2", score=0.60)]
        gen0 = _gen_record(0, agents, fitness_list, mutations=[{
            "parentId": "a-1", "childId": "a-3", "type": "add",
            "toolAdded": "search", "toolRemoved": None,
        }])

        df = _flatten_generations([gen0], "t-1")
        assert len(df) == 1
        row = df.to_dicts()[0]
        assert row["tournament_id"] == "t-1"
        assert row["generation"] == 0
        assert row["population_size"] == 2
        assert row["best_fitness"] == 0.60
        assert row["mean_fitness"] == pytest.approx(0.575, abs=0.001)
        assert row["mutation_count"] == 1
        assert row["crossover_count"] == 0
        assert row["duration_ms"] == 100

    def test_multiple_generations(self):
        gens = [
            _gen_record(0, [_agent("a-1", ["act"])], [_fitness("a-1", score=0.5)]),
            _gen_record(1, [_agent("a-2", ["search"])], [_fitness("a-2", score=0.6)]),
        ]
        df = _flatten_generations(gens, "t-1")
        assert len(df) == 2
        assert df["generation"].to_list() == [0, 1]

    def test_empty_input(self):
        df = _flatten_generations([], "t-1")
        assert len(df) == 0
        assert set(df.columns) == set(_GENERATIONS_SCHEMA.keys())


# ---------------------------------------------------------------------------
# Tests: _flatten_agents
# ---------------------------------------------------------------------------

class TestFlattenAgents:
    def test_agents_with_fitness(self):
        agents = [_agent("a-1", ["inspect", "act"]), _agent("a-2", ["search"])]
        fitness_list = [_fitness("a-1", score=0.55), _fitness("a-2", score=0.60)]
        gen0 = _gen_record(0, agents, fitness_list, survivors=["a-2"])

        df = _flatten_agents([gen0], "t-1")
        assert len(df) == 2

        rows = df.sort("agent_id").to_dicts()
        # a-1
        assert rows[0]["agent_id"] == "a-1"
        assert rows[0]["tools"] == '["act", "inspect"]'  # sorted
        assert rows[0]["tool_count"] == 2
        assert rows[0]["origin"] == "seed"
        assert rows[0]["fitness_score"] == 0.55
        assert rows[0]["survived"] is False
        # a-2
        assert rows[1]["agent_id"] == "a-2"
        assert rows[1]["tools"] == '["search"]'
        assert rows[1]["tool_count"] == 1
        assert rows[1]["fitness_score"] == 0.60
        assert rows[1]["survived"] is True

    def test_mutation_origin(self):
        agents = [_agent("a-3", ["search", "model"], origin="mutation",
                         parent_ids=["a-1"])]
        fitness_list = [_fitness("a-3", score=0.58)]
        gen1 = _gen_record(1, agents, fitness_list)

        df = _flatten_agents([gen1], "t-1")
        row = df.to_dicts()[0]
        assert row["origin"] == "mutation"
        assert row["parent_ids"] == '["a-1"]'
        assert row["generation"] == 1

    def test_empty_input(self):
        df = _flatten_agents([], "t-1")
        assert len(df) == 0
        assert set(df.columns) == set(_AGENTS_SCHEMA.keys())

    def test_missing_fitness_for_agent(self):
        """Agent present but no fitness record → null fitness fields."""
        agents = [_agent("a-1", ["inspect"])]
        gen0 = _gen_record(0, agents, [])  # no fitness

        df = _flatten_agents([gen0], "t-1")
        row = df.to_dicts()[0]
        assert row["fitness_score"] is None
        assert row["completion_rate"] is None
