"""Generic declarative application-profile supervision."""

from __future__ import annotations

from typing import Any

from .common import Fault, save


class Environment:
    def __init__(self, worker) -> None:
        self.w = worker
        self.apps: dict[str, Any] = {}
        self.enabled = False

    def ensure(self):
        profile = self.w.c.get("application_profile", "default")
        declared = self.w.c.get("application_profiles", {}).get(profile, [])
        if not isinstance(declared, list):
            msg = "application profile must declare a list of executable argv arrays"
            raise Fault(msg)
        self.enabled = True
        for argv in declared:
            if (
                not isinstance(argv, list)
                or not argv
                or not all(isinstance(value, str) for value in argv)
            ):
                msg = "application profile contains invalid argv"
                raise Fault(msg)
            key = "\0".join(argv)
            process = self.apps.get(key)
            if process is None or process.poll() is not None:
                self.apps[key] = self.w.spawn(argv, {})
        save(self.w.folder / "session.json", self.w.c)
        return self.status()

    def tick(self) -> None:
        if self.enabled:
            self.ensure()

    def status(self):
        return {
            "profile": self.w.c.get("application_profile", "default"),
            "enabled": self.enabled,
            "applications": {
                key: {"running": process.poll() is None}
                for key, process in self.apps.items()
            },
        }

    def restart(self):
        for process in self.apps.values():
            if process.poll() is None:
                process.terminate()
        self.apps = {}
        return self.ensure()
