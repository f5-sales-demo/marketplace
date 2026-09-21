import io
import pathlib
import sys
import unittest
import wave
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib.common import Fault  # noqa: E402
from xorgctl_lib.media import media  # noqa: E402


def one_second_wav():
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(48_000)
        stream.writeframes(b"\0\0" * 48_000)
    return output.getvalue()


class Worker:
    def __init__(self):
        self.c = {
            "audio_sink": "xorgctl_desktop",
            "audio_injection_sink": "xcsh_microphone",
        }
        self.commands = []
        self.piper_input = None

    def command(self, argv, input_data=None, timeout=None):
        self.commands.append((argv, timeout))
        if argv[0] == "/fake/piper":
            self.piper_input = input_data
            return one_second_wav()
        return b""


class AudioStimulusTests(unittest.TestCase):
    @patch(
        "xorgctl_lib.media.speech_engine",
        return_value={
            "ready": True,
            "piper": pathlib.Path("/fake/piper"),
            "model": pathlib.Path("/fake/model"),
        },
    )
    def test_speech_rejects_a_duration_that_would_clip_the_waveform(self, _engine):
        worker = Worker()
        with self.assertRaisesRegex(Fault, "too short"):
            media(
                worker,
                "audio.stimulus",
                {"kind": "speech", "token": "XCSH-UAT", "seconds": 1.5},
            )
        self.assertFalse(any(argv[0] == "ffmpeg" for argv, _timeout in worker.commands))

    @patch(
        "xorgctl_lib.media.speech_engine",
        return_value={
            "ready": True,
            "piper": pathlib.Path("/fake/piper"),
            "model": pathlib.Path("/fake/model"),
        },
    )
    def test_speech_plays_one_complete_token_without_retaining_media(self, _engine):
        worker = Worker()
        result = media(
            worker,
            "audio.stimulus",
            {"kind": "speech", "token": "XCSH-UAT", "seconds": 2},
        )
        self.assertEqual(worker.piper_input, b"X, C, S, H, dash, U, A, T.\n")
        self.assertEqual(result["complete"], True)
        self.assertEqual(result["speech_seconds"], 1.0)
        self.assertEqual(result["retention"], "none")


if __name__ == "__main__":
    unittest.main()
