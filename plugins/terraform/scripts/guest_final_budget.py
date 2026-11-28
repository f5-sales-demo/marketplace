"""Validate a separate guest final window without minting source authority."""

import re
from typing import NoReturn, TypeGuard

ORIGINAL_BUDGET_MS = 7200000
FINAL_RESERVE_MS = 300000
STARTUP_MS = 15000
DEADLINE_COUNT = 2
UUID = re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
START = re.compile(r"[0-9]+")


def refuse(message: str) -> NoReturn:
    """Refuse invalid input without exposing its private value."""
    raise ValueError(message)


def integer(value: object) -> TypeGuard[int]:
    """Accept integer clocks and identities while refusing booleans."""
    return isinstance(value, int) and not isinstance(value, bool)


def validate_final_guest_budget(request: dict, now: int) -> tuple[int, int, int]:
    """Keep original operation and exact parent/callback/final window identities."""
    if not isinstance(request, dict) or not integer(now):
        refuse("Original final guest request and clock required")
    start = request.get("originalStartMs")
    operation = request.get("originalDeadlineMs")
    deadlines = request.get("deadlines")
    startup = request.get("startupDeadlineMs")
    final = request.get("finalCapture")
    if (
        not integer(start)
        or start < 0
        or not integer(operation)
        or operation - start != ORIGINAL_BUDGET_MS
    ):
        refuse("Original final guest budget or capture identity required")
    if (
        not isinstance(deadlines, list)
        or len(deadlines) != DEADLINE_COUNT
        or not all(integer(value) for value in deadlines)
        or not integer(startup)
    ):
        refuse("Original final guest budget or capture identity required")
    if not isinstance(final, dict) or set(final) != {
        "callbackNonce",
        "parentIdentity",
        "finalStartedMs",
        "finalDeadlineMs",
    }:
        refuse("Original final guest budget or capture identity required")
    began = final["finalStartedMs"]
    end = final["finalDeadlineMs"]
    parent = final["parentIdentity"]
    nonce = final["callbackNonce"]
    if (
        not integer(began)
        or not integer(end)
        or began < start
        or end - began != FINAL_RESERVE_MS
        or not began <= now < end
    ):
        refuse("Original final guest window, parent or startup budget differs")
    if deadlines != [end, end] or not now < startup <= min(end, now + STARTUP_MS):
        refuse("Original final guest window, parent or startup budget differs")
    if not isinstance(nonce, str) or UUID.fullmatch(nonce) is None:
        refuse("Original final guest window, parent or startup budget differs")
    if not isinstance(parent, dict) or set(parent) != {"pid", "group", "start", "boot"}:
        refuse("Original final guest window, parent or startup budget differs")
    if (
        not integer(parent["pid"])
        or not 0 < parent["pid"] < 2**31
        or not integer(parent["group"])
        or parent["group"] != parent["pid"]
    ):
        refuse("Original final guest window, parent or startup budget differs")
    if (
        not isinstance(parent["start"], str)
        or START.fullmatch(parent["start"]) is None
        or not isinstance(parent["boot"], str)
        or UUID.fullmatch(parent["boot"]) is None
    ):
        refuse("Original final guest window, parent or startup budget differs")
    return end, end, startup
