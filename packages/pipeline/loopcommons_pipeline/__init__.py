"""Loopcommons data pipeline — Dagster + dbt for trace event processing."""

from dagster import Definitions

from .assets.consolidation import consolidated_events
from .assets.dbt import dbt_project_assets
from .assets.export import training_export
from .assets.arena_consolidation import arena_traces
from .assets.arena_export import arena_training_export
from .resources import dbt_resource, duckdb_resource

# Build asset list, excluding None (dbt_project_assets is None if manifest missing)
_assets = [consolidated_events, training_export, arena_traces, arena_training_export]
if dbt_project_assets is not None:
    _assets.append(dbt_project_assets)

defs = Definitions(
    assets=_assets,
    resources={
        "dbt": dbt_resource,
        "duckdb": duckdb_resource,
    },
)
