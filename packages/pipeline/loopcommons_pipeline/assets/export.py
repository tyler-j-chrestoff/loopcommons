"""Export asset: writes training JSONL files from dbt mart models.

Reads the dbt-materialized training tables from DuckDB and exports
them as versioned, checksummed JSONL files for ML consumption.
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import polars as pl
from dagster import (
    AssetExecutionContext,
    AssetIn,
    MetadataValue,
    asset,
)

_WAREHOUSE_DIR = Path(__file__).parent.parent.parent.parent.parent / "data" / "warehouse"
_EXPORTS_DIR = Path(__file__).parent.parent.parent.parent.parent / "data" / "exports"


def _export_table_as_jsonl(
    db_path: Path,
    table_name: str,
    output_dir: Path,
) -> tuple[Path, int, str]:
    """Export a DuckDB table as a JSONL file with SHA256 checksum."""
    output_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    output_path = output_dir / f"{table_name}_{date_str}.jsonl"

    conn = duckdb.connect(str(db_path), read_only=True)
    try:
        df = conn.execute(f"SELECT * FROM {table_name}").pl()
    finally:
        conn.close()

    hasher = hashlib.sha256()
    row_count = 0

    with open(output_path, "w") as f:
        for row in df.iter_rows(named=True):
            line = json.dumps(row, default=str) + "\n"
            f.write(line)
            hasher.update(line.encode())
            row_count += 1

    checksum = hasher.hexdigest()

    # Write checksum sidecar
    checksum_path = output_path.with_suffix(".jsonl.sha256")
    checksum_path.write_text(f"{checksum}  {output_path.name}\n")

    return output_path, row_count, checksum


@asset(
    group_name="export",
    description="Export training JSONL files from dbt mart models with SHA256 checksums.",
    deps=["training_security_reasoning", "training_rewrite_pairs", "training_threat_calibration"],
    kinds={"jsonl"},
)
def training_export(context: AssetExecutionContext) -> None:
    """Export all training tables as versioned JSONL."""
    db_path = _WAREHOUSE_DIR / "loopcommons.duckdb"

    if not db_path.exists():
        context.log.warning(f"DuckDB file not found at {db_path} — run dbt first")
        return

    tables = [
        "training_security_reasoning",
        "training_rewrite_pairs",
        "training_threat_calibration",
    ]

    total_rows = 0
    exports = []

    for table in tables:
        try:
            path, rows, checksum = _export_table_as_jsonl(
                db_path, table, _EXPORTS_DIR / "training"
            )
            total_rows += rows
            exports.append({"table": table, "rows": rows, "checksum": checksum[:16]})
            context.log.info(f"Exported {rows} rows from {table} → {path}")
        except Exception as e:
            context.log.warning(f"Failed to export {table}: {e}")

    # Write metrics.json for the web API (/api/metrics reads this file)
    try:
        conn = duckdb.connect(str(db_path), read_only=True)
        accuracy = conn.execute("SELECT * FROM metrics_amygdala_accuracy").pl().to_dicts()
        regime = conn.execute("SELECT * FROM metrics_regime_classification").pl().to_dicts()
        conn.close()

        metrics = {
            "accuracy": accuracy[0] if accuracy else None,
            "regime": regime[0] if regime else None,
        }
        metrics_path = _WAREHOUSE_DIR / "metrics.json"
        metrics_path.write_text(json.dumps(metrics, default=str, indent=2))
        context.log.info(f"Wrote metrics.json to {metrics_path}")
    except Exception as e:
        context.log.warning(f"Failed to write metrics.json: {e}")

    context.add_output_metadata({
        "total_rows": MetadataValue.int(total_rows),
        "exports": MetadataValue.json(exports),
    })
