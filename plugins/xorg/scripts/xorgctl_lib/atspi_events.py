#!/usr/bin/python3
"""Emit redacted wake categories for relevant Zoom accessibility events."""
import json
import pathlib
import sys

try:
    import gi
    gi.require_version('Atspi','2.0')
    from gi.repository import Atspi
except Exception as exc:
    print('AT-SPI unavailable: '+str(exc),file=sys.stderr)
    raise SystemExit(1)

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from xorgctl_lib.zoom import zoom_atspi_event_category


def application_name(source):
    try:
        application=source.get_application()
        if application: return application.get_name() or ''
    except Exception:
        pass
    return ''


def accessible_name(event):
    if event.type.startswith('object:property-change:accessible-name'):
        try:
            if isinstance(event.any_data,str): return event.any_data
        except Exception:
            pass
    try: return event.source.get_name() or ''
    except Exception: return ''


def receive(event):
    category=zoom_atspi_event_category(event.type,application_name(event.source),accessible_name(event))
    if category:
        print(json.dumps({'wake':category},separators=(',',':')),flush=True)


listener=Atspi.EventListener.new(receive)
for event_type in ('object:property-change:accessible-name','object:state-changed',
                   'object:children-changed','window:create','window:destroy'):
    listener.register(event_type)
print(json.dumps({'ready':True},separators=(',',':')),flush=True)
Atspi.event_main()
