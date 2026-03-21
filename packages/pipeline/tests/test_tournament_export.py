"""Tests for tournament training data export: composition-fitness pairs."""

import hashlib
import json
from pathlib import Path

import polars as pl
import pytest

from loopcommons_pipeline.assets.tournament_export import (
    _build_composition_fitness_records,
    _AGENTS_SCHEMA,
)


# ---------------------------------------------------------------------------
# Fixtures — agent rows as they'd appear in Parquet
# ---------------------------------------------------------------------------

def _agent_row(agent_id: str, tools: str, generation: int = 0,
               origin: str = "seed", fitness: float = 0.55,
               completion: float = 0.33, mean_score: float = 0.25,
               mean_steps: float = 3.0, survival: float = 1.0,
               cost: float = 0.006, tool_count: int = 2,
               tournament_id: str = "t-1", survived: bool = True,
               parent_ids: str = "[]",
               identity_hash: str = "hash-abc") -> dict:
    return {
        "tournament_id": tournament_id,
        "generation": generation,
        "agent_id": agent_id,
        "tools": tools,
        "tool_count": tool_count,
        "origin": origin,
        "parent_ids": parent_ids,
        "identity_hash": identity_hash,
        "fitness_score": fitness,
        "completion_rate": completion,
        "mean_score": mean_score,
        "mean_steps": mean_steps,
        "survival_rate": survival,
        "total_cost": cost,
        "survived": survived,
    }


# ---------------------------------------------------------------------------
# Tests: _build_composition_fitness_records
# ---------------------------------------------------------------------------

class TestBuildCompositionFitnessRecords:
    def test_basic_record(self):
        agents = [_agent_row("a-1", '["inspect","act"]', tool_count=2,
                             fitness=0.55, completion=0.33)]
        df = pl.DataFrame(agents, schema=_AGENTS_SCHEMA)
        records = _build_composition_fitness_records(df)

        assert len(records) == 1
        r = records[0]
        assert r["tools"] == ["inspect", "act"]
        assert r["tool_count"] == 2
        assert r["fitness_score"] == 0.55
        assert r["completion_rate"] == 0.33
        assert r["generation"] == 0
        assert r["origin"] == "seed"
        assert r["tournament_id"] == "t-1"

    def test_multiple_agents_multiple_generations(self):
        agents = [
            _agent_row("a-1", '["inspect"]', generation=0, tool_count=1, fitness=0.50),
            _agent_row("a-2", '["search","model"]', generation=0, tool_count=2, fitness=0.60),
            _agent_row("a-1", '["inspect"]', generation=1, tool_count=1, fitness=0.55),
        ]
        df = pl.DataFrame(agents, schema=_AGENTS_SCHEMA)
        records = _build_composition_fitness_records(df)

        assert len(records) == 3
        # Verify each record is independent
        gen0_inspect = [r for r in records if r["generation"] == 0 and "inspect" in r["tools"]]
        assert len(gen0_inspect) == 1
        assert gen0_inspect[0]["fitness_score"] == 0.50

    def test_excludes_null_fitness(self):
        """Agents without fitness scores should be excluded."""
        agents = [
            _agent_row("a-1", '["inspect"]', tool_count=1, fitness=0.55),
            {**_agent_row("a-2", '["search"]', tool_count=1), "fitness_score": None,
             "completion_rate": None, "mean_score": None, "mean_steps": None,
             "survival_rate": None, "total_cost": None},
        ]
        df = pl.DataFrame(agents, schema=_AGENTS_SCHEMA)
        records = _build_composition_fitness_records(df)
        assert len(records) == 1
        assert records[0]["agent_id"] == "a-1"

    def test_empty_input(self):
        df = pl.DataFrame(schema=_AGENTS_SCHEMA)
        records = _build_composition_fitness_records(df)
        assert len(records) == 0

    def test_preserves_evolutionary_context(self):
        """Records include origin and parent info for provenance."""
        agents = [
            _agent_row("a-3", '["act","search"]', generation=2, tool_count=2,
                       origin="crossover", parent_ids='["a-1","a-2"]',
                       fitness=0.65, survived=True),
        ]
        df = pl.DataFrame(agents, schema=_AGENTS_SCHEMA)
        records = _build_composition_fitness_records(df)

        r = records[0]
        assert r["origin"] == "crossover"
        assert r["parent_ids"] == ["a-1", "a-2"]
        assert r["survived"] is True
        assert r["generation"] == 2

    def test_multi_tournament(self):
        """Records from different tournaments are distinguished."""
        agents = [
            _agent_row("a-1", '["inspect"]', tool_count=1, tournament_id="t-1", fitness=0.50),
            _agent_row("a-2", '["inspect"]', tool_count=1, tournament_id="t-2", fitness=0.60),
        ]
        df = pl.DataFrame(agents, schema=_AGENTS_SCHEMA)
        records = _build_composition_fitness_records(df)

        assert len(records) == 2
        t1 = [r for r in records if r["tournament_id"] == "t-1"]
        t2 = [r for r in records if r["tournament_id"] == "t-2"]
        assert t1[0]["fitness_score"] == 0.50
        assert t2[0]["fitness_score"] == 0.60
