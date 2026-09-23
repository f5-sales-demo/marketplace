#!/usr/bin/env python3
"""Wait for one live, site-scoped KVM registration without exposing credentials."""
# pylint: disable=invalid-name

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

TERMINAL = {"DONE", "FAILED", "FAILED_INACTIVE", "RETIRED"}
MIN_TOKEN_LENGTH = 20


def registration_matches(document: dict, site: str) -> list[dict]:
    """Return the live KVM registrations owned by one exact site."""
    items = document.get("items", [])
    if not isinstance(items, list):
        error = "registration response has no items array"
        raise TypeError(error)
    matches = []
    for item in items:
        if not isinstance(item, dict):
            error = "registration response contains a malformed item"
            raise TypeError(error)
        get_spec = item.get("get_spec", {})
        get_spec = get_spec if isinstance(get_spec, dict) else {}
        passport = get_spec.get("passport", {})
        passport = passport if isinstance(passport, dict) else {}
        infra = get_spec.get("infra", {})
        infra = infra if isinstance(infra, dict) else {}
        obj = item.get("object", {})
        obj = obj if isinstance(obj, dict) else {}
        status = obj.get("status", {})
        status = status if isinstance(status, dict) else {}
        if (
            passport.get("cluster_name") in (None, "", site)
            and infra.get("provider") == "KVM"
            and status.get("current_state", "") not in TERMINAL
        ):
            matches.append(item)
    return matches


def main() -> int:
    """Wait until exactly one live KVM registration belongs to the requested site."""
    if len(sys.argv) != 2:  # noqa: PLR2004
        sys.stderr.write("usage: wait-registration.py SITE_NAME\n")
        return 2
    site = sys.argv[1]
    api_url = os.environ.get("XCSH_API_URL", "").rstrip("/")
    token = os.environ.get("XCSH_API_TOKEN", "")
    if not api_url.startswith("https://") or len(token) < MIN_TOKEN_LENGTH:
        sys.stderr.write("active xcsh context is unavailable\n")
        return 1
    path = (
        "/api/register/namespaces/system/registrations_by_site/"
        + urllib.parse.quote(site, safe="")
    )
    deadline = time.monotonic() + 3600
    while time.monotonic() < deadline:
        request = urllib.request.Request(  # noqa: S310 -- HTTPS is required above.
            api_url + path,
            headers={
                "Accept": "application/json",
                "Authorization": "APIToken " + token,
                "Connection": "close",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 -- HTTPS is required above.
                document = json.loads(response.read())
            matches = registration_matches(document, site)
            if len(matches) == 1:
                return 0
            if len(matches) > 1:
                sys.stderr.write("site has more than one live KVM registration\n")
                return 1
        except (OSError, ValueError, TypeError, urllib.error.HTTPError):
            pass
        time.sleep(10)
    sys.stderr.write("timed out waiting for one live KVM registration\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
