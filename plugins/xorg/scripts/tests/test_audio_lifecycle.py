# ruff: noqa: E402
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib import media as media_module


class FakeAudioWorker:
    def __init__(self, folder):
        self.c: dict[str, object] = {"name": "console"}
        self.folder = folder
        self.modules = []
        self.sinks = []
        self.sources = []
        self.next_module = 1

    def wait(self, _seconds):
        return None

    def command(self, argv):
        if argv[:4] == ["pactl", "--format=json", "list", "sinks"]:
            return json.dumps(self.sinks).encode()
        if argv[:4] == ["pactl", "--format=json", "list", "sources"]:
            return json.dumps(self.sources).encode()
        if argv[:3] == ["pactl", "load-module", "module-null-sink"]:
            module = self.next_module
            self.next_module += 1
            name = next(
                item.split("=", 1)[1] for item in argv if item.startswith("sink_name=")
            )
            description = next(
                item.split("device.description=", 1)[1]
                for item in argv
                if item.startswith("sink_properties=")
            )
            self.sinks.append(
                {"name": name, "description": description, "owner_module": module}
            )
            return str(module).encode()
        if argv[:3] == ["pactl", "load-module", "module-remap-source"]:
            module = self.next_module
            self.next_module += 1
            name = next(
                item.split("=", 1)[1]
                for item in argv
                if item.startswith("source_name=")
            )
            self.sources.append(
                {"name": name, "description": "xcsh Microphone", "owner_module": module}
            )
            return str(module).encode()
        if argv[:2] == ["pactl", "unload-module"]:
            module = int(argv[2])
            self.sinks = [
                item for item in self.sinks if item.get("owner_module") != module
            ]
            self.sources = [
                item for item in self.sources if item.get("owner_module") != module
            ]
            return b""
        raise AssertionError(argv)


class AudioLifecycleTests(unittest.TestCase):
    def test_audio_create_persists_virtual_intent_and_application_names(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = FakeAudioWorker(pathlib.Path(directory))
            result = media_module.media(worker, "audio.create", {})
            persisted = json.loads((worker.folder / "session.json").read_text())

        self.assertEqual(result["sink"], "xorgctl_console")
        self.assertEqual(worker.sinks[0]["description"], "xcsh Inbound Audio")
        self.assertEqual(persisted["audio_source"], "xcsh_microphone_input")
        self.assertTrue(persisted["virtual_audio"])

    def test_audio_create_repairs_an_interrupted_stale_sink(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = FakeAudioWorker(pathlib.Path(directory))
            worker.sinks.append(
                {
                    "name": "xorgctl_console",
                    "description": "stale physical fallback",
                    "owner_module": 9,
                }
            )
            worker.next_module = 10
            media_module.media(worker, "audio.create", {})

        matches = [item for item in worker.sinks if item["name"] == "xorgctl_console"]
        self.assertEqual(
            matches,
            [
                {
                    "name": "xorgctl_console",
                    "description": "xcsh Inbound Audio",
                    "owner_module": 10,
                }
            ],
        )

    def test_worker_recreates_configured_virtual_audio_after_service_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = FakeAudioWorker(pathlib.Path(directory))
            worker.c["virtual_audio"] = True
            with patch.object(media_module, "media") as create_audio:
                media_module.reconcile_persistent_audio(worker)
        create_audio.assert_called_once_with(worker, "audio.create", {})


if __name__ == "__main__":
    unittest.main()
