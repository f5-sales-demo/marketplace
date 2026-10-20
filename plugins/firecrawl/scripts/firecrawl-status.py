#!/usr/bin/env python3
"""Read Firecrawl identity and optional health evidence without changing service state."""

import argparse
import json
import os
import re
import signal
import sys
import time
from datetime import UTC, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

HTTP_OK = 200
HTTP_REDIRECT = 300
MAX_BYTES = 1024 * 1024
SECRET_KEY = re.compile(
    r"(?:password|secret|token|authorization|cookie|api[_-]?key)", re.IGNORECASE
)


def redact(value: Any) -> Any:
    """Redact known credential keys while retaining literal noncredential values."""
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if SECRET_KEY.search(key) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def endpoint() -> str:
    """Resolve the credential-free configured HTTP(S) base endpoint."""
    parsed = urlsplit(os.environ.get("FIRECRAWL_API_URL", "http://127.0.0.1:3002/"))
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        message = "Invalid endpoint"
        raise ValueError(message)
    _ = parsed.port
    return urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path.rstrip("/") + "/", "", "")
    )


class NoRedirect(HTTPRedirectHandler):
    """Refuse redirects outside the requested API endpoint."""

    def redirect_request(self, *_args: Any, **_kwargs: Any) -> None:
        """Return no redirected request."""
        return


def request(url: str, deadline: float) -> dict[str, Any]:
    """Collect one bounded JSON response with explicit availability and completeness."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return {"state": "unavailable", "reason": "timeout"}
    try:
        try:
            response = build_opener(NoRedirect).open(
                Request(url, headers={"Accept": "application/json"}),  # noqa: S310 - validated HTTP(S) endpoint, redirects refused
                timeout=min(5, remaining),
            )
        except HTTPError as error:
            response = error
        with response:
            status = response.code
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            return {
                "state": "invalid_response",
                "httpStatus": status,
                "reason": "response_too_large",
                "evidenceComplete": False,
            }
        try:
            body = redact(json.loads(raw))
        except (ValueError, UnicodeError, RecursionError):
            return {
                "state": "invalid_response",
                "httpStatus": status,
                "reason": "malformed_json",
                "evidenceComplete": False,
            }
        else:
            return {
                "state": "ok" if HTTP_OK <= status < HTTP_REDIRECT else "failed",
                "httpStatus": status,
                "body": body,
                "evidenceComplete": True,
            }
    except (URLError, TimeoutError, OSError, ValueError):
        return {
            "state": "unavailable",
            "reason": "network_or_timeout",
            "evidenceComplete": False,
        }


def collect() -> dict[str, Any]:
    """Report API identity separately from optional health and backend acceptance."""
    try:
        base = endpoint()
    except ValueError:
        return {
            "state": "invalid_configuration",
            "guidance": "Set FIRECRAWL_API_URL to an HTTP(S) base URL without credentials, query or fragment.",
        }
    deadline = time.monotonic() + 10
    root = request(base, deadline)
    body = root.get("body")
    ready = (
        root["state"] == "ok"
        and isinstance(body, dict)
        and body.get("message") == "Firecrawl API"
        and body.get("documentation_url") == "https://docs.firecrawl.dev"
    )
    result = {
        "state": "ready"
        if ready
        else ("unavailable" if root["state"] == "unavailable" else "invalid_response"),
        "endpoint": base,
        "scope": "API identity and optional version; backend jobs and scraping are not checked",
        "version": "unknown",
        "healthState": "not_checked",
        "collectedAt": datetime.now(UTC).isoformat(),
        "warnings": [],
        "evidence": {"identity": root},
    }
    if ready:
        health = request(base + "v1/health", deadline)
        if health["state"] == "ok" and not isinstance(health.get("body"), dict):
            health["state"] = "invalid_response"
            health["reason"] = "expected_object"
        result["evidence"]["health"] = health
        result["healthState"] = health["state"]
        if health["state"] == "ok" and isinstance(health.get("body"), dict):
            result["version"] = health["body"].get("version", "unknown")
        if health["state"] != "ok":
            result["warnings"].append(
                "Optional health/version check failed or is unavailable; backend readiness remains unverified."
            )
    else:
        result["guidance"] = (
            "Check the configured endpoint and the existing Firecrawl service. In a devcontainer, check ENABLE_FIRECRAWL=true."
        )
    return result


def deadline_expired(_signal: int, _frame: Any) -> None:
    """Interrupt slow trickle responses at the collector total deadline."""
    raise TimeoutError


def main() -> int:
    """Print complete sanitized evidence and signal identity failure through exit status."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit unsuccessfully unless API identity is verified",
    )
    parser.parse_args()
    signal.signal(signal.SIGALRM, deadline_expired)
    signal.setitimer(signal.ITIMER_REAL, 10)
    try:
        result = collect()
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    json.dump(result, sys.stdout, ensure_ascii=True, indent=2)
    sys.stdout.write("\n")
    return 0 if result["state"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
