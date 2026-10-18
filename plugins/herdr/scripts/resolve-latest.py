#!/usr/bin/env python3
"""Resolve current maintained fork bytes once; never infer digests from downloads."""
# pylint: disable=invalid-name

import json
import os
import re
import sys
import urllib.request


def resolve(target: str) -> dict[str, str]:
    """Return immutable asset metadata from the latest stable fork release."""
    name = "herdr-" + target
    headers = {"User-Agent": "f5-sales-demo-herdr-installer"}
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(
        "https://api.github.com/repos/f5-sales-demo/herdr/releases/latest",
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 - fixed HTTPS vendor endpoint
        release = json.load(response)
    if (
        release.get("draft")
        or release.get("prerelease")
        or not re.fullmatch(r"v[0-9]+[.][0-9]+[.][0-9]+", release["tag_name"])
    ):
        message = "Stable fork release required"
        raise ValueError(message)
    asset = next(a for a in release["assets"] if a["name"] == name)
    digest = asset.get("digest", "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        message = "Published fork digest required"
        raise ValueError(message)
    expected = (
        "https://github.com/f5-sales-demo/herdr/releases/download/"
        + release["tag_name"]
        + "/"
        + name
    )
    if asset["browser_download_url"] != expected:
        message = "Fork release origin mismatch"
        raise ValueError(message)
    return {"version": release["tag_name"][1:], "url": expected, "sha256": digest[7:]}


if __name__ == "__main__":
    result = resolve(sys.argv[1])
    sys.stdout.write(
        " ".join((result["version"], result["sha256"], result["url"])) + "\n"
    )
