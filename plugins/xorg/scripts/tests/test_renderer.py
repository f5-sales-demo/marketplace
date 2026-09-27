# ruff: noqa: ANN001, ANN201, ANN204, D101, D102, E402, PT009, S108

import pathlib
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib import renderer


class _Worker:
    def __init__(self, folder, env):
        self.folder = pathlib.Path(folder)
        self.c = {"env": env}


class RendererTests(unittest.TestCase):
    def test_native_launch_preserves_session_path_and_user_local_bin_once(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = _Worker(
                directory,
                {
                    "DISPLAY": ":121",
                    "XAUTHORITY": "/tmp/authority",
                    "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/502/bus",
                    "PATH": "/usr/local/bin:/usr/bin",
                },
            )
            with (
                patch.object(
                    renderer.pathlib.Path,
                    "home",
                    return_value=pathlib.Path("/home/robin"),
                ),
                patch.dict(renderer.os.environ, {"PATH": "/usr/bin"}, clear=True),
            ):
                argv, env = renderer.prepare(
                    worker, ["ghostty", "-e", "herdr"], {"renderer": "native"}
                )

        self.assertEqual(argv, ["ghostty", "-e", "herdr"])
        self.assertEqual(env["DISPLAY"], ":121")
        self.assertEqual(env["XAUTHORITY"], "/tmp/authority")
        self.assertEqual(env["DBUS_SESSION_BUS_ADDRESS"], "unix:path=/run/user/502/bus")
        self.assertEqual(
            env["PATH"].split(":"),
            ["/home/robin/.local/bin", "/usr/local/bin", "/usr/bin"],
        )

    def test_egl_launch_preserves_session_path_and_user_local_bin_once(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = _Worker(
                directory,
                {
                    "DISPLAY": ":121",
                    "XAUTHORITY": "/tmp/authority",
                    "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/502/bus",
                    "PATH": "/home/robin/.local/bin:/usr/bin",
                },
            )
            with patch.object(
                renderer.pathlib.Path, "home", return_value=pathlib.Path("/home/robin")
            ):
                argv, env = renderer.prepare(
                    worker, ["ghostty", "-e", "herdr"], {"renderer": "egl"}
                )

        self.assertEqual(
            argv, ["/opt/VirtualGL/bin/vglrun", "-d", "egl0", "ghostty", "-e", "herdr"]
        )
        self.assertEqual(env["DISPLAY"], ":121")
        self.assertEqual(env["DBUS_SESSION_BUS_ADDRESS"], "unix:path=/run/user/502/bus")
        self.assertEqual(env["PATH"].split(":").count("/home/robin/.local/bin"), 1)

    def test_glx_launch_preserves_session_environment_and_user_local_bin(self):
        with tempfile.TemporaryDirectory() as directory:
            source_authority = pathlib.Path(directory) / "session-Xauthority"
            source_authority.write_text("session-record", encoding="utf-8")
            worker = _Worker(
                directory,
                {
                    "DISPLAY": ":121",
                    "XAUTHORITY": str(source_authority),
                    "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/502/bus",
                    "PATH": "/usr/local/bin:/usr/bin",
                },
            )
            extract = SimpleNamespace(stdout="xauth-record")
            with (
                patch.object(
                    renderer.pathlib.Path,
                    "home",
                    return_value=pathlib.Path("/home/robin"),
                ),
                patch.object(renderer.pathlib.Path, "is_file", return_value=True),
                patch.object(
                    renderer,
                    "run",
                    Mock(side_effect=[extract, SimpleNamespace(stdout="")]),
                ) as run,
            ):
                argv, env = renderer.prepare(
                    worker,
                    ["ghostty", "-e", "herdr"],
                    {"renderer": "glx", "device": ":99", "gpu_auth": "/gpu/auth"},
                )
            combined = pathlib.Path(directory) / "GPU-Xauthority"
            copied_authority = combined.read_text(encoding="utf-8")

        self.assertEqual(
            argv,
            ["/opt/VirtualGL/bin/vglrun", "-d", ":99", "ghostty", "-e", "herdr"],
        )
        self.assertEqual(env["DISPLAY"], ":121")
        self.assertEqual(env["DBUS_SESSION_BUS_ADDRESS"], "unix:path=/run/user/502/bus")
        self.assertEqual(
            env["PATH"].split(":"),
            ["/home/robin/.local/bin", "/usr/local/bin", "/usr/bin"],
        )
        self.assertEqual(env["XAUTHORITY"], str(combined))
        self.assertEqual(copied_authority, "session-record")
        self.assertEqual(
            run.call_args_list[0].args,
            (["xauth", "-f", pathlib.Path("/gpu/auth"), "extract", "-", ":99"],),
        )
        self.assertEqual(
            run.call_args_list[1].args,
            (["xauth", "-f", combined, "merge", "-"],),
        )
        self.assertEqual(run.call_args_list[1].kwargs, {"input": "xauth-record"})
