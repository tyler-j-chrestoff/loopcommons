"""Shared Dagster resources for the pipeline."""

import os
from pathlib import Path

from dagster_dbt import DbtCliResource
from dagster_duckdb import DuckDBResource

# Resolve paths relative to the pipeline package root
_PIPELINE_DIR = Path(__file__).parent.parent
_DBT_PROJECT_DIR = _PIPELINE_DIR / "dbt_project"
_WAREHOUSE_DIR = _PIPELINE_DIR.parent.parent / "data" / "warehouse"

dbt_resource = DbtCliResource(
    project_dir=str(_DBT_PROJECT_DIR),
    profiles_dir=str(_DBT_PROJECT_DIR),
)

duckdb_resource = DuckDBResource(
    database=str(
        os.environ.get(
            "LOOPCOMMONS_DDB_PATH",
            _WAREHOUSE_DIR / "loopcommons.duckdb",
        )
    ),
)
