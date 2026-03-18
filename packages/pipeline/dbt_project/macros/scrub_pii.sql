-- scrub_pii: macro to strip PII patterns from text columns.
--
-- Applied to all training export models before materialization.
-- Strips: IP addresses (v4 and v6), email addresses, and common PII patterns.

{% macro scrub_pii(column_name) %}
    -- Strip IPv4 addresses (e.g., 192.168.1.1)
    regexp_replace(
        -- Strip email addresses
        regexp_replace(
            -- Strip IPv6 addresses (simplified: hex groups with colons)
            regexp_replace(
                coalesce({{ column_name }}, ''),
                '[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){7}',
                '[REDACTED_IPV6]',
                'g'
            ),
            '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
            '[REDACTED_EMAIL]',
            'g'
        ),
        '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',
        '[REDACTED_IP]',
        'g'
    )
{% endmacro %}
