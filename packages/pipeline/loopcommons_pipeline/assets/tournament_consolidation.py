"""Tournament consolidation: reads tournament JSONL, writes Parquet.

Tournament data lives at: packages/llm/data/arena/tournament/generations.jsonl
This asset writes two Parquet tables:
  - data/warehouse/tournament_generations/generations.parquet (per-generation summary)
  - data/warehouse/tournament_agents/agents.parquet (per-agent-per-generation with fitness)
"""

import json
from pathlib import Path

import polars as pl
from dagster import (
    AssetExecutionContext,
    MetadataValue,
    asset,
)

_TOURNAMENT_DATA_DIR = Path(__file__).parent.parent.parent.parent.parent / "llm" / "data" / "arena" / "tournament"
_WAREHOUSE_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "warehouse"


def _read_tournament_data(tournament_dir: Path) -> dict:
    """Read generations.jsonl, return {generations: [...], complete: {...} | None}."""
    result: dict = {"generations": [], "complete": None}

    gen_path = tournament_dir / "generations.jsonl"
    if not gen_path.exists():
        return result

    for line in gen_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue

        if record.get("type") == "generation":
            result["generations"].append(record)
        elif record.get("type") == "tournament_complete":
            result["complete"] = record

    return result


# ---------------------------------------------------------------------------
# Generations table
# ---------------------------------------------------------------------------

_GENERATIONS_SCHEMA = {
    "tournament_id": pl.Utf8,
    "generation": pl.Int32,
    "population_size": pl.Int32,
    "best_fitness": pl.Float64,
    "mean_fitness": pl.Float64,
    "worst_fitness": pl.Float64,
    "survivor_count": pl.Int32,
    "mutation_count": pl.Int32,
    "crossover_count": pl.Int32,
    "duration_ms": pl.Int64,
}


def _flatten_generations(generations: list[dict], tournament_id: str) -> pl.DataFrame:
    """One row per generation with summary statistics."""
    rows = []
    for gen in generations:
        fitness_scores = [f["fitnessScore"] for f in gen.get("fitness", [])]
        rows.append({
            "tournament_id": tournament_id,
            "generation": gen["generation"],
            "population_size": gen.get("populationSize", 0),
            "best_fitness": max(fitness_scores) if fitness_scores else None,
            "mean_fitness": sum(fitness_scores) / len(fitness_scores) if fitness_scores else None,
            "worst_fitness": min(fitness_scores) if fitness_scores else None,
            "survivor_count": len(gen.get("survivors", [])),
            "mutation_count": len(gen.get("mutations", [])),
            "crossover_count": len(gen.get("crossovers", [])),
            "duration_ms": gen.get("durationMs"),
        })

    if not rows:
        return pl.DataFrame(schema=_GENERATIONS_SCHEMA)
    return pl.DataFrame(rows, schema=_GENERATIONS_SCHEMA)


# ---------------------------------------------------------------------------
# Agents table
# ---------------------------------------------------------------------------

_AGENTS_SCHEMA = {
    "tournament_id": pl.Utf8,
    "generation": pl.Int32,
    "agent_id": pl.Utf8,
    "tools": pl.Utf8,       # JSON array, sorted
    "tool_count": pl.Int32,
    "origin": pl.Utf8,
    "parent_ids": pl.Utf8,  # JSON array
    "identity_hash": pl.Utf8,
    "fitness_score": pl.Float64,
    "completion_rate": pl.Float64,
    "mean_score": pl.Float64,
    "mean_steps": pl.Float64,
    "survival_rate": pl.Float64,
    "total_cost": pl.Float64,
    "survived": pl.Boolean,
}


def _flatten_agents(generations: list[dict], tournament_id: str) -> pl.DataFrame:
    """One row per agent per generation with fitness metrics."""
    rows = []
    for gen in generations:
        fitness_map = {f["agentId"]: f for f in gen.get("fitness", [])}
        survivors = set(gen.get("survivors", []))

        for agent in gen.get("agents", []):
            agent_id = agent["id"]
            fitness = fitness_map.get(agent_id)
            tools = sorted(agent.get("tools", []))

            rows.append({
                "tournament_id": tournament_id,
                "generation": gen["generation"],
                "agent_id": agent_id,
                "tools": json.dumps(tools),
                "tool_count": len(tools),
                "origin": agent.get("origin", "seed"),
                "parent_ids": json.dumps(agent.get("parentIds", [])),
                "identity_hash": agent.get("identity", ""),
                "fitness_score": fitness["fitnessScore"] if fitness else None,
                "completion_rate": fitness["metrics"]["completionRate"] if fitness else None,
                "mean_score": fitness["metrics"]["meanScore"] if fitness else None,
                "mean_steps": float(fitness["metrics"]["meanSteps"]) if fitness else None,
                "survival_rate": fitness["metrics"]["survivalRate"] if fitness else None,
                "total_cost": fitness["metrics"]["totalCost"] if fitness else None,
                "survived": agent_id in survivors,
            })

    if not rows:
        return pl.DataFrame(schema=_AGENTS_SCHEMA)
    return pl.DataFrame(rows, schema=_AGENTS_SCHEMA)


# ---------------------------------------------------------------------------
# Dagster asset
# ---------------------------------------------------------------------------

@asset(
    group_name="arena",
    description="Reads tournament JSONL, flattens to generation-level and agent-level Parquet.",
    kinds={"parquet", "polars"},
)
def tournament_traces(context: AssetExecutionContext) -> None:
    """Consolidate tournament data into Parquet for analysis and export."""
    context.log.info(f"Reading tournament data from {_TOURNAMENT_DATA_DIR}")

    data = _read_tournament_data(_TOURNAMENT_DATA_DIR)

    if not data["generations"]:
        context.log.info("No tournament generations found")
        return

    tournament_id = (data["complete"] or {}).get("tournamentId", "unknown")

    # Write generations table
    gen_df = _flatten_generations(data["generations"], tournament_id)
    gen_dir = _WAREHOUSE_DIR / "tournament_generations"
    gen_dir.mkdir(parents=True, exist_ok=True)
    gen_df.write_parquet(gen_dir / "generations.parquet")

    # Write agents table
    agents_df = _flatten_agents(data["generations"], tournament_id)
    agents_dir = _WAREHOUSE_DIR / "tournament_agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    agents_df.write_parquet(agents_dir / "agents.parquet")

    context.add_output_metadata({
        "tournament_id": MetadataValue.text(tournament_id),
        "num_generations": MetadataValue.int(len(gen_df)),
        "num_agent_records": MetadataValue.int(len(agents_df)),
        "best_fitness": MetadataValue.json(
            gen_df.select("generation", "best_fitness").to_dicts()
        ),
    })

    context.log.info(
        f"Wrote {len(gen_df)} generations and {len(agents_df)} agent records"
    )
