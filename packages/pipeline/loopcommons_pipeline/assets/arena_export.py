"""Arena training data export: choice-point reasoning pairs and approach-divergence pairs.

Two novel datasets that don't exist in the open-source ecosystem:
1. Choice-point reasoning pairs — same structural decision, different developmental context,
   different reasoning. The core training signal for path-dependent identity.
2. Approach-divergence pairs — same final approach category, different acquisition path.
   Shows how different histories produce convergent behavior.
"""

import hashlib
import json
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

import polars as pl
from dagster import (
    AssetExecutionContext,
    MetadataValue,
    asset,
)

_WAREHOUSE_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "warehouse"
_EXPORTS_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "exports"


def _build_reasoning_pairs(cp_df: pl.DataFrame) -> list[dict]:
    """Build choice-point reasoning pairs from the choice points table.

    For each encounter, take all pairs of runs that faced the same choice point.
    Each pair captures: same structural decision, different developmental context,
    different reasoning.
    """
    if len(cp_df) == 0:
        return []

    pairs = []
    encounter_ids = cp_df["encounter_id"].unique().to_list()

    for enc_id in encounter_ids:
        enc_cps = cp_df.filter(pl.col("encounter_id") == enc_id)
        if len(enc_cps) < 2:
            continue

        rows = enc_cps.to_dicts()
        for a, b in combinations(rows, 2):
            # Only pair if they have different developmental context
            if a["current_tools"] == b["current_tools"]:
                continue

            pairs.append({
                "encounter_id": enc_id,
                "experiment_id": a["experiment_id"],
                "agent_a_run_id": a["run_id"],
                "agent_b_run_id": b["run_id"],
                "agent_a_current_tools": a["current_tools"],
                "agent_b_current_tools": b["current_tools"],
                "agent_a_selected": a["selected_tool"],
                "agent_b_selected": b["selected_tool"],
                "agent_a_reasoning": a["acquisition_reasoning"],
                "agent_b_reasoning": b["acquisition_reasoning"],
                "agent_a_self_assessment": a["self_assessment"],
                "agent_b_self_assessment": b["self_assessment"],
                "agent_a_forward_model": a["forward_model"],
                "agent_b_forward_model": b["forward_model"],
                "agent_a_confidence": a["confidence_score"],
                "agent_b_confidence": b["confidence_score"],
                "agent_a_state_hash": a["state_hash"],
                "agent_b_state_hash": b["state_hash"],
            })

    return pairs


def _build_divergence_pairs(runs_df: pl.DataFrame) -> list[dict]:
    """Build approach-divergence pairs from the runs table.

    Find runs with the same final approach category but different paths.
    These show how different developmental histories produce convergent behavior.
    """
    if len(runs_df) == 0:
        return []

    pairs = []
    approaches = runs_df["e4_approach_category"].unique().to_list()

    for approach in approaches:
        if approach is None:
            continue

        approach_runs = runs_df.filter(pl.col("e4_approach_category") == approach)
        if len(approach_runs) < 2:
            continue

        rows = approach_runs.to_dicts()
        for a, b in combinations(rows, 2):
            if a["path_id"] == b["path_id"]:
                continue

            pairs.append({
                "shared_approach": approach,
                "experiment_id": a["experiment_id"],
                "run_a_id": a["run_id"],
                "run_b_id": b["run_id"],
                "path_a": a["path_id"],
                "path_b": b["path_id"],
                "run_a_victory": a["is_victory"],
                "run_b_victory": b["is_victory"],
                "run_a_step_count": a["step_count"],
                "run_b_step_count": b["step_count"],
            })

    return pairs


def _export_jsonl_with_checksum(
    records: list[dict],
    output_dir: Path,
    name: str,
) -> tuple[Path, int, str]:
    """Write records as JSONL with SHA256 checksum sidecar."""
    output_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    output_path = output_dir / f"{name}_{date_str}.jsonl"

    hasher = hashlib.sha256()
    count = 0

    with open(output_path, "w") as f:
        for record in records:
            line = json.dumps(record, default=str) + "\n"
            f.write(line)
            hasher.update(line.encode())
            count += 1

    checksum = hasher.hexdigest()

    checksum_path = output_path.with_suffix(".jsonl.sha256")
    checksum_path.write_text(f"{checksum}  {output_path.name}\n")

    return output_path, count, checksum


@asset(
    group_name="arena",
    description="Export arena training data: reasoning pairs and divergence pairs as versioned JSONL.",
    deps=["arena_traces"],
    kinds={"jsonl"},
)
def arena_training_export(context: AssetExecutionContext) -> None:
    """Export novel training datasets from arena experiments."""
    runs_path = _WAREHOUSE_DIR / "arena_runs" / "runs.parquet"
    cp_path = _WAREHOUSE_DIR / "arena_choice_points" / "choice_points.parquet"

    if not runs_path.exists() or not cp_path.exists():
        context.log.warning("Arena Parquet files not found — run arena_traces first")
        return

    runs_df = pl.read_parquet(runs_path)
    cp_df = pl.read_parquet(cp_path)

    export_dir = _EXPORTS_DIR / "arena"

    # Export 1: reasoning pairs
    reasoning_pairs = _build_reasoning_pairs(cp_df)
    rp_path, rp_count, rp_checksum = _export_jsonl_with_checksum(
        reasoning_pairs, export_dir, "choice_point_reasoning_pairs"
    )
    context.log.info(f"Exported {rp_count} reasoning pairs → {rp_path}")

    # Export 2: divergence pairs
    divergence_pairs = _build_divergence_pairs(runs_df)
    dp_path, dp_count, dp_checksum = _export_jsonl_with_checksum(
        divergence_pairs, export_dir, "approach_divergence_pairs"
    )
    context.log.info(f"Exported {dp_count} divergence pairs → {dp_path}")

    context.add_output_metadata({
        "reasoning_pairs": MetadataValue.int(rp_count),
        "divergence_pairs": MetadataValue.int(dp_count),
        "reasoning_checksum": MetadataValue.text(rp_checksum[:16]),
        "divergence_checksum": MetadataValue.text(dp_checksum[:16]),
    })
