"""Consolidation asset: reads raw session JSONL files, writes Parquet.

This is the bridge between the web server's append-only JSONL output and
the columnar storage that dbt-duckdb queries efficiently.

Web server writes:  packages/web/data/sessions/{YYYY-MM-DD}/{sessionId}.jsonl
This asset writes:  data/warehouse/events/date={YYYY-MM-DD}/events.parquet
"""

import json
from pathlib import Path

import polars as pl
from dagster import (
    AssetExecutionContext,
    DailyPartitionsDefinition,
    MetadataValue,
    asset,
)

_WEB_SESSIONS_DIR = Path(__file__).parent.parent.parent.parent.parent / "web" / "data" / "sessions"
_WAREHOUSE_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "warehouse"

DAILY_PARTITIONS = DailyPartitionsDefinition(start_date="2026-03-17")


def _read_jsonl_files(directory: Path) -> list[dict]:
    """Read all finalized .jsonl files in a directory, yielding parsed events."""
    events = []
    if not directory.exists():
        return events

    for jsonl_file in sorted(directory.glob("*.jsonl")):
        # Skip in-progress temp files
        if jsonl_file.name.endswith(".tmp.jsonl"):
            continue

        session_id = jsonl_file.stem
        for line_num, line in enumerate(jsonl_file.read_text().splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                # Attach session_id at the top level for every event
                # (some events like session:start already have it, but
                # amygdala/orchestrator/trace events don't)
                event["session_id"] = session_id
                event["source_file"] = jsonl_file.name
                event["line_number"] = line_num
                events.append(event)
            except json.JSONDecodeError:
                continue  # skip malformed lines

    return events


def _flatten_events(raw_events: list[dict]) -> pl.DataFrame:
    """Flatten heterogeneous events into a wide table with typed columns.

    Each event type populates different columns; the rest are null.
    This is the staging-friendly format that dbt models will filter by type.
    """
    rows = []
    for evt in raw_events:
        row = {
            # Common fields
            "session_id": evt.get("session_id"),
            "event_type": evt.get("type"),
            "timestamp_ms": evt.get("timestamp"),
            "source_file": evt.get("source_file"),
            "line_number": evt.get("line_number"),
            # Amygdala fields
            "original_prompt": evt.get("originalPrompt"),
            "rewritten_prompt": evt.get("rewrittenPrompt"),
            "rewrite_modified": evt.get("modified"),
            "intent": evt.get("intent"),
            "intent_confidence": evt.get("confidence"),
            "threat_score": evt.get("threat", {}).get("score") if isinstance(evt.get("threat"), dict) else None,
            "threat_category": evt.get("threat", {}).get("category") if isinstance(evt.get("threat"), dict) else None,
            "threat_reasoning": evt.get("threat", {}).get("reasoning") if isinstance(evt.get("threat"), dict) else None,
            # Context delegation
            "context_total_messages": evt.get("totalMessages"),
            "context_delegated_messages": evt.get("delegatedMessages"),
            "context_summary": evt.get("plan", {}).get("contextSummary") if isinstance(evt.get("plan"), dict) else None,
            # Orchestrator fields
            "subagent_id": evt.get("subagentId"),
            "subagent_name": evt.get("subagentName"),
            "threat_override": evt.get("threatOverride"),
            "allowed_tools": json.dumps(evt.get("allowedTools")) if evt.get("allowedTools") else None,
            "routing_reasoning": evt.get("reasoning") if evt.get("type", "").startswith("orchestrator:") else None,
            "delivered_messages": evt.get("deliveredMessages"),
            "used_summary": evt.get("usedSummary"),
            # Rate limit fields
            "rate_limit_remaining": evt.get("remaining"),
            "rate_limit_limit": evt.get("limit"),
            "active_connections": evt.get("activeConnections"),
            "concurrency_limit": evt.get("concurrencyLimit"),
            "reset_ms": evt.get("resetMs"),
            # Spend fields
            "current_spend_usd": evt.get("currentSpendUsd"),
            "daily_cap_usd": evt.get("dailyCapUsd"),
            "remaining_usd": evt.get("remainingUsd"),
            "percent_used": evt.get("percentUsed"),
            "reset_at_utc": evt.get("resetAtUtc"),
            # Security fields
            "security_reason": evt.get("reason") if evt.get("type", "").startswith("security:") else None,
            # Trace fields (round/tool level)
            "round_index": evt.get("round", {}).get("index") if isinstance(evt.get("round"), dict) else evt.get("round") if isinstance(evt.get("round"), int) else None,
            "round_latency_ms": evt.get("round", {}).get("latencyMs") if isinstance(evt.get("round"), dict) else None,
            "response_content": evt.get("round", {}).get("response", {}).get("content") if isinstance(evt.get("round"), dict) else None,
            "input_tokens": evt.get("round", {}).get("response", {}).get("usage", {}).get("inputTokens") if isinstance(evt.get("round"), dict) else None,
            "output_tokens": evt.get("round", {}).get("response", {}).get("usage", {}).get("outputTokens") if isinstance(evt.get("round"), dict) else None,
            "cached_tokens": evt.get("round", {}).get("response", {}).get("usage", {}).get("cachedTokens") if isinstance(evt.get("round"), dict) else None,
            "round_cost": evt.get("round", {}).get("response", {}).get("cost") if isinstance(evt.get("round"), dict) else None,
            "finish_reason": evt.get("round", {}).get("response", {}).get("finishReason") if isinstance(evt.get("round"), dict) else None,
            # Tool execution fields
            "tool_name": evt.get("toolName") or (evt.get("execution", {}).get("toolName") if isinstance(evt.get("execution"), dict) else None),
            "tool_input": json.dumps(evt.get("input") or (evt.get("execution", {}).get("input") if isinstance(evt.get("execution"), dict) else None)),
            "tool_output": evt.get("execution", {}).get("output") if isinstance(evt.get("execution"), dict) else None,
            "tool_error": evt.get("execution", {}).get("error") if isinstance(evt.get("execution"), dict) else None,
            "tool_latency_ms": evt.get("execution", {}).get("latencyMs") if isinstance(evt.get("execution"), dict) else None,
            # Text delta
            "text_delta": evt.get("delta"),
            # Trace complete (summary-level)
            "trace_id": evt.get("trace", {}).get("id") if isinstance(evt.get("trace"), dict) else None,
            "trace_model": evt.get("trace", {}).get("model") if isinstance(evt.get("trace"), dict) else None,
            "trace_provider": evt.get("trace", {}).get("provider") if isinstance(evt.get("trace"), dict) else None,
            "trace_total_cost": evt.get("trace", {}).get("totalCost") if isinstance(evt.get("trace"), dict) else None,
            "trace_total_input_tokens": evt.get("trace", {}).get("totalUsage", {}).get("inputTokens") if isinstance(evt.get("trace"), dict) else None,
            "trace_total_output_tokens": evt.get("trace", {}).get("totalUsage", {}).get("outputTokens") if isinstance(evt.get("trace"), dict) else None,
            "trace_total_cached_tokens": evt.get("trace", {}).get("totalUsage", {}).get("cachedTokens") if isinstance(evt.get("trace"), dict) else None,
            "trace_status": evt.get("trace", {}).get("status") if isinstance(evt.get("trace"), dict) else None,
            "trace_num_rounds": len(evt.get("trace", {}).get("rounds", [])) if isinstance(evt.get("trace"), dict) else None,
            # Session complete
            "session_message_count": evt.get("summary", {}).get("messageCount") if isinstance(evt.get("summary"), dict) else None,
            "session_event_count": evt.get("summary", {}).get("eventCount") if isinstance(evt.get("summary"), dict) else None,
            "session_duration_ms": evt.get("summary", {}).get("durationMs") if isinstance(evt.get("summary"), dict) else None,
            # Feedback fields
            "feedback_message_id": evt.get("messageId") if evt.get("type") == "eval:feedback" else None,
            "feedback_rating": evt.get("rating") if evt.get("type") == "eval:feedback" else None,
            "feedback_category": evt.get("category") if evt.get("type") == "eval:feedback" else None,
            # Error
            "error_message": evt.get("error") if evt.get("type") == "error" else None,
            # Full event JSON for anything we didn't extract
            "raw_event_json": json.dumps(evt),
        }
        rows.append(row)

    if not rows:
        # Return empty DataFrame with schema
        return pl.DataFrame(schema=_SCHEMA)

    return pl.DataFrame(rows, schema=_SCHEMA)


# Explicit schema to prevent type inference issues across partitions
_SCHEMA = {
    "session_id": pl.Utf8,
    "event_type": pl.Utf8,
    "timestamp_ms": pl.Int64,
    "source_file": pl.Utf8,
    "line_number": pl.Int32,
    "original_prompt": pl.Utf8,
    "rewritten_prompt": pl.Utf8,
    "rewrite_modified": pl.Boolean,
    "intent": pl.Utf8,
    "intent_confidence": pl.Float64,
    "threat_score": pl.Float64,
    "threat_category": pl.Utf8,
    "threat_reasoning": pl.Utf8,
    "context_total_messages": pl.Int64,
    "context_delegated_messages": pl.Int64,
    "context_summary": pl.Utf8,
    "subagent_id": pl.Utf8,
    "subagent_name": pl.Utf8,
    "threat_override": pl.Boolean,
    "allowed_tools": pl.Utf8,
    "routing_reasoning": pl.Utf8,
    "delivered_messages": pl.Int64,
    "used_summary": pl.Boolean,
    "rate_limit_remaining": pl.Int64,
    "rate_limit_limit": pl.Int64,
    "active_connections": pl.Int64,
    "concurrency_limit": pl.Int64,
    "reset_ms": pl.Int64,
    "current_spend_usd": pl.Float64,
    "daily_cap_usd": pl.Float64,
    "remaining_usd": pl.Float64,
    "percent_used": pl.Float64,
    "reset_at_utc": pl.Utf8,
    "security_reason": pl.Utf8,
    "round_index": pl.Int64,
    "round_latency_ms": pl.Int64,
    "response_content": pl.Utf8,
    "input_tokens": pl.Int64,
    "output_tokens": pl.Int64,
    "cached_tokens": pl.Int64,
    "round_cost": pl.Float64,
    "finish_reason": pl.Utf8,
    "tool_name": pl.Utf8,
    "tool_input": pl.Utf8,
    "tool_output": pl.Utf8,
    "tool_error": pl.Utf8,
    "tool_latency_ms": pl.Int64,
    "text_delta": pl.Utf8,
    "trace_id": pl.Utf8,
    "trace_model": pl.Utf8,
    "trace_provider": pl.Utf8,
    "trace_total_cost": pl.Float64,
    "trace_total_input_tokens": pl.Int64,
    "trace_total_output_tokens": pl.Int64,
    "trace_total_cached_tokens": pl.Int64,
    "trace_status": pl.Utf8,
    "trace_num_rounds": pl.Int64,
    "session_message_count": pl.Int64,
    "session_event_count": pl.Int64,
    "session_duration_ms": pl.Int64,
    "feedback_message_id": pl.Utf8,
    "feedback_rating": pl.Utf8,
    "feedback_category": pl.Utf8,
    "error_message": pl.Utf8,
    "raw_event_json": pl.Utf8,
}


@asset(
    partitions_def=DAILY_PARTITIONS,
    group_name="consolidation",
    description="Reads raw session JSONL files and consolidates into partitioned Parquet.",
    kinds={"parquet", "polars"},
)
def consolidated_events(context: AssetExecutionContext) -> None:
    """Read JSONL session files for a date partition, flatten, write Parquet."""
    partition_date = context.partition_key  # e.g., "2026-03-17"
    sessions_dir = _WEB_SESSIONS_DIR / partition_date

    context.log.info(f"Reading JSONL files from {sessions_dir}")

    raw_events = _read_jsonl_files(sessions_dir)

    if not raw_events:
        context.log.info(f"No events found for {partition_date}")
        return

    df = _flatten_events(raw_events)

    # Write partitioned Parquet
    output_dir = _WAREHOUSE_DIR / "events" / f"date={partition_date}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "events.parquet"

    df.write_parquet(output_path)

    context.add_output_metadata({
        "num_events": MetadataValue.int(len(df)),
        "num_sessions": MetadataValue.int(df["session_id"].n_unique()),
        "event_types": MetadataValue.json(
            df["event_type"].value_counts().sort("count", descending=True).to_dicts()
        ),
        "partition_date": MetadataValue.text(partition_date),
        "output_path": MetadataValue.path(str(output_path)),
    })

    context.log.info(
        f"Wrote {len(df)} events from {df['session_id'].n_unique()} sessions to {output_path}"
    )
