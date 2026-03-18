"""dbt assets — software-defined assets from dbt models.

Uses DbtCliResource to parse the dbt project manifest and create
Dagster assets for each dbt model automatically.

IMPORTANT: Run `dbt parse` in dbt_project/ before importing this module.
The manifest.json must exist at dbt_project/target/manifest.json.
"""

from pathlib import Path

from dagster import AssetExecutionContext
from dagster_dbt import DbtCliResource, dbt_assets

_DBT_PROJECT_DIR = Path(__file__).parent.parent.parent / "dbt_project"
_MANIFEST_PATH = _DBT_PROJECT_DIR / "target" / "manifest.json"


def _get_dbt_assets():
    """Lazy factory: only creates the dbt_assets decorator when manifest exists."""
    if not _MANIFEST_PATH.exists():
        return None

    @dbt_assets(
        manifest=_MANIFEST_PATH,
        project=_DBT_PROJECT_DIR,
    )
    def dbt_project_assets(context: AssetExecutionContext, dbt: DbtCliResource):
        """Materialize all dbt models as Dagster assets."""
        yield from dbt.cli(["build"], context=context).stream()

    return dbt_project_assets


dbt_project_assets = _get_dbt_assets()
