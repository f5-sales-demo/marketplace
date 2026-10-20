---
description: >-
  Check configured Firecrawl API identity, optional version, and connectivity
---

# Firecrawl status

Run the shipped read-only collector directly. Optional delegation to
`firecrawl:firecrawl-operator` uses the same collector.

```bash
python3 "${XCSH_PLUGIN_ROOT}/scripts/firecrawl_status.py"
```

Use a Bash tool timeout of 15 seconds. The collector uses `FIRECRAWL_API_URL`,
defaulting to `http://127.0.0.1:3002/`, with bounded requests and no redirects.
It verifies the Firecrawl identity response before checking optional `/v1/health`.
A successful root response alone does not prove queue, browser, database, or scrape readiness.

Report state, endpoint, scope, version, collection time, warnings, and corrective guidance.
Preserve zero, false, empty strings, and unknown values. Keep the complete sanitized
collector result in the Bash result for expansion; do not pipe it through `head`,
slice strings, or repeat the full evidence in the conclusion. If a response is too
large or malformed, report incomplete evidence explicitly. A failed health check
remains visible even when the version is unknown. Show list previews of twelve rows
when summarizing additional evidence, and retain the complete result once.

If unavailable, check the configured endpoint and existing service. In a devcontainer,
check `ENABLE_FIRECRAWL=true`. Do not start or reconfigure infrastructure as part of status.
