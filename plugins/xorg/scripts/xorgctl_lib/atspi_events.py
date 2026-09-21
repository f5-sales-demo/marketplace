"""Bounded, application-neutral AT-SPI event observation."""
from __future__ import annotations

def event_category(event_type, application, accessible_name):
    return {"event": str(event_type), "application": str(application)[:128], "name_present": bool(accessible_name)}
