"""Tournament training data export: composition-fitness pairs.

Novel dataset — architecture search data for tool-augmented agents.
Each record maps a tool composition to its fitness in an evolutionary tournament,
with full provenance (generation, origin, parents, survival).
"""

import json
from pathlib import Path

import polars as pl
from dagster import (
    AssetExecutionContext,
    MetadataValue,
    asset,
)

from .arena_export import _export_jsonl_with_checksum

_WAREHOUSE_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "warehouse"
_EXPORTS_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "exports"

# Re-export for test access
from .tournament_consolidation import _AGENTS_SCHEMA


def _build_composition_fitness_records(agents_df: pl.DataFrame) -> list[dict]:
    """Build composition-fitness training records from the agents table.

    Each record: {tools, tool_count, fitness_score, metrics, generation, origin, ...}
    Excludes agents with null fitness (not yet evaluated).
    """
    if len(agents_df) == 0:
        return []

    # Filter out agents without fitness scores
    evaluated = agents_df.filter(pl.col("fitness_score").is_not_null())

    records = []
    for row in evaluated.to_dicts():
        records.append({
            "tournament_id": row["tournament_id"],
            "generation": row["generation"],
            "agent_id": row["agent_id"],
            "tools": json.loads(row["tools"]),
            "tool_count": row["tool_count"],
            "origin": row["origin"],
            "parent_ids": json.loads(row["parent_ids"]),
            "identity_hash": row["identity_hash"],
            "fitness_score": row["fitness_score"],
            "completion_rate": row["completion_rate"],
            "mean_score": row["mean_score"],
            "mean_steps": row["mean_steps"],
            "survival_rate": row["survival_rate"],
            "total_cost": row["total_cost"],
            "survived": row["survived"],
        })

    return records


@asset(
    group_name="arena",
    description="Export composition-fitness pairs as versioned JSONL training data.",
    deps=["tournament_traces"],
    kinds={"jsonl"},
)
def tournament_training_export(context: AssetExecutionContext) -> None:
    """Export novel training dataset: composition → fitness mappings from tournaments."""
    agents_path = _WAREHOUSE_DIR / "tournament_agents" / "agents.parquet"

    if not agents_path.exists():
        context.log.warning("Tournament agents Parquet not found — run tournament_traces first")
        return

    agents_df = pl.read_parquet(agents_path)
    records = _build_composition_fitness_records(agents_df)

    export_dir = _EXPORTS_DIR / "tournament"
    path, count, checksum = _export_jsonl_with_checksum(
        records, export_dir, "composition_fitness_pairs"
    )

    context.log.info(f"Exported {count} composition-fitness pairs → {path}")

    # Summary stats
    unique_compositions = len(set(json.dumps(r["tools"]) for r in records))
    tournaments = list(set(r["tournament_id"] for r in records))

    context.add_output_metadata({
        "record_count": MetadataValue.int(count),
        "unique_compositions": MetadataValue.int(unique_compositions),
        "tournaments": MetadataValue.json(tournaments),
        "checksum": MetadataValue.text(checksum[:16]),
    })
