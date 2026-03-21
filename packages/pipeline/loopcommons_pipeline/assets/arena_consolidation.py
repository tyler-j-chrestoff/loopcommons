"""Arena trace consolidation: reads arena JSONL traces, writes Parquet.

Arena traces live at: packages/llm/data/arena/{experiment_id}/{run_id}.jsonl
This asset writes two Parquet tables:
  - data/warehouse/arena_runs/runs.parquet (run-level summary)
  - data/warehouse/arena_choice_points/choice_points.parquet (choice-point-level)
"""

import json
from pathlib import Path

import polars as pl
from dagster import (
    AssetExecutionContext,
    MetadataValue,
    asset,
)

_ARENA_DATA_DIR = Path(__file__).parent.parent.parent.parent.parent / "llm" / "data" / "arena"
_WAREHOUSE_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "warehouse"


def _read_arena_traces(arena_dir: Path) -> list[dict]:
    """Read all experiment/run JSONL files, return list of {experiment_id, run_id, events}."""
    results = []
    if not arena_dir.exists():
        return results

    for exp_dir in sorted(arena_dir.iterdir()):
        if not exp_dir.is_dir():
            continue
        experiment_id = exp_dir.name

        for jsonl_file in sorted(exp_dir.glob("*.jsonl")):
            run_id = jsonl_file.stem
            events = []
            for line in jsonl_file.read_text().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

            results.append({
                "experiment_id": experiment_id,
                "run_id": run_id,
                "events": events,
            })

    return results


# ---------------------------------------------------------------------------
# Runs table
# ---------------------------------------------------------------------------

_RUNS_SCHEMA = {
    "experiment_id": pl.Utf8,
    "run_id": pl.Utf8,
    "path_id": pl.Utf8,
    "path_label": pl.Utf8,
    "started_at": pl.Utf8,
    "completed_at": pl.Utf8,
    "is_victory": pl.Boolean,
    "is_dead": pl.Boolean,
    "death_cause": pl.Utf8,
    "death_details": pl.Utf8,
    "step_count": pl.Int32,
    "choice_point_count": pl.Int32,
    "e4_approach_category": pl.Utf8,
    "final_score": pl.Float64,
    "starting_state_hash": pl.Utf8,
}


def _flatten_run_events(traces: list[dict]) -> pl.DataFrame:
    """Extract run-level summary from each trace."""
    rows = []
    for trace in traces:
        events = trace["events"]
        header = next((e for e in events if e.get("type") == "run:header"), {})
        complete = next((e for e in events if e.get("type") == "run:complete"), None)
        death = next((e for e in events if e.get("type") == "run:death"), None)

        rows.append({
            "experiment_id": trace["experiment_id"],
            "run_id": trace["run_id"],
            "path_id": header.get("pathId"),
            "path_label": header.get("pathLabel"),
            "started_at": header.get("startedAt"),
            "completed_at": (complete or death or {}).get("completedAt"),
            "is_victory": complete.get("isVictory", False) if complete else False,
            "is_dead": death is not None,
            "death_cause": death.get("cause") if death else None,
            "death_details": death.get("details") if death else None,
            "step_count": sum(1 for e in events if e.get("type") == "encounter:step"),
            "choice_point_count": sum(1 for e in events if e.get("type") == "choice:point"),
            "e4_approach_category": complete.get("e4ApproachCategory") if complete else None,
            "final_score": complete.get("finalScore") if complete else None,
            "starting_state_hash": header.get("startingStateHash"),
        })

    if not rows:
        return pl.DataFrame(schema=_RUNS_SCHEMA)
    return pl.DataFrame(rows, schema=_RUNS_SCHEMA)


# ---------------------------------------------------------------------------
# Choice points table
# ---------------------------------------------------------------------------

_CHOICE_POINTS_SCHEMA = {
    "experiment_id": pl.Utf8,
    "run_id": pl.Utf8,
    "encounter_id": pl.Utf8,
    "offered_tools": pl.Utf8,  # JSON array
    "current_tools": pl.Utf8,  # JSON array
    "selected_tool": pl.Utf8,
    "dropped_tool": pl.Utf8,
    "confidence_score": pl.Float64,
    "self_assessment": pl.Utf8,
    "acquisition_reasoning": pl.Utf8,
    "sacrifice_reasoning": pl.Utf8,
    "forward_model": pl.Utf8,
    "memory_state_dump": pl.Utf8,
    "state_hash": pl.Utf8,
    "chain_hash": pl.Utf8,
    "prompt_rendered": pl.Utf8,
    "response_raw": pl.Utf8,
}


def _flatten_choice_points(traces: list[dict]) -> pl.DataFrame:
    """Extract choice-point-level records."""
    rows = []
    for trace in traces:
        for event in trace["events"]:
            if event.get("type") != "choice:point":
                continue
            rows.append({
                "experiment_id": trace["experiment_id"],
                "run_id": trace["run_id"],
                "encounter_id": event.get("encounterId"),
                "offered_tools": json.dumps(event.get("offeredTools", [])),
                "current_tools": json.dumps(event.get("currentTools", [])),
                "selected_tool": event.get("selectedTool"),
                "dropped_tool": event.get("droppedTool"),
                "confidence_score": event.get("confidenceScore"),
                "self_assessment": event.get("selfAssessment"),
                "acquisition_reasoning": event.get("acquisitionReasoning"),
                "sacrifice_reasoning": event.get("sacrificeReasoning"),
                "forward_model": event.get("forwardModel"),
                "memory_state_dump": event.get("memoryStateDump"),
                "state_hash": event.get("stateHash"),
                "chain_hash": event.get("chainHash"),
                "prompt_rendered": event.get("promptRendered"),
                "response_raw": event.get("responseRaw"),
            })

    if not rows:
        return pl.DataFrame(schema=_CHOICE_POINTS_SCHEMA)
    return pl.DataFrame(rows, schema=_CHOICE_POINTS_SCHEMA)


# ---------------------------------------------------------------------------
# Dagster asset
# ---------------------------------------------------------------------------

@asset(
    group_name="arena",
    description="Reads arena JSONL traces, flattens to run-level and choice-point-level Parquet.",
    kinds={"parquet", "polars"},
)
def arena_traces(context: AssetExecutionContext) -> None:
    """Consolidate arena traces into Parquet for analysis."""
    context.log.info(f"Reading arena traces from {_ARENA_DATA_DIR}")

    traces = _read_arena_traces(_ARENA_DATA_DIR)

    if not traces:
        context.log.info("No arena traces found")
        return

    # Write runs table
    runs_df = _flatten_run_events(traces)
    runs_dir = _WAREHOUSE_DIR / "arena_runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    runs_path = runs_dir / "runs.parquet"
    runs_df.write_parquet(runs_path)

    # Write choice points table
    cp_df = _flatten_choice_points(traces)
    cp_dir = _WAREHOUSE_DIR / "arena_choice_points"
    cp_dir.mkdir(parents=True, exist_ok=True)
    cp_path = cp_dir / "choice_points.parquet"
    cp_df.write_parquet(cp_path)

    context.add_output_metadata({
        "num_runs": MetadataValue.int(len(runs_df)),
        "num_choice_points": MetadataValue.int(len(cp_df)),
        "experiments": MetadataValue.json(
            runs_df["experiment_id"].unique().to_list()
        ),
        "path_distribution": MetadataValue.json(
            runs_df["path_id"].value_counts().sort("count", descending=True).to_dicts()
        ),
    })

    context.log.info(
        f"Wrote {len(runs_df)} runs and {len(cp_df)} choice points"
    )
