import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib import renderer  # noqa: E402


class _Worker:
    def __init__(self, folder, env):
        self.folder = pathlib.Path(folder)
        self.c = {"env": env}


class RendererTests(unittest.TestCase):
    def test_native_launch_preserves_session_path_and_user_local_bin_once(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = _Worker(directory, {"DISPLAY": ":121", "XAUTHORITY": "/tmp/authority", "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/502/bus", "PATH": "/usr/local/bin:/usr/bin"})
            with (patch.object(renderer.pathlib.Path, "home", return_value=pathlib.Path("/home/robin")), patch.dict(renderer.os.environ, {"PATH": "/usr/bin"}, clear=True)):
                argv, env = renderer.prepare(worker, ["ghostty", "-e", "herdr"], {"renderer": "native"})

        self.assertEqual(argv, ["ghostty", "-e", "herdr"])
        self.assertEqual(env["DISPLAY"], ":121")
        self.assertEqual(env["XAUTHORITY"], "/tmp/authority")
        self.assertEqual(env["DBUS_SESSION_BUS_ADDRESS"], "unix:path=/run/user/502/bus")
        self.assertEqual(env["PATH"].split(":"), ["/home/robin/.local/bin", "/usr/local/bin", "/usr/bin"])

    def test_egl_launch_preserves_session_path_and_user_local_bin_once(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = _Worker(directory, {"DISPLAY": ":121", "XAUTHORITY": "/tmp/authority", "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/502/bus", "PATH": "/home/robin/.local/bin:/usr/bin"})
            with patch.object(renderer.pathlib.Path, "home", return_value=pathlib.Path("/home/robin")):
                argv, env = renderer.prepare(worker, ["ghostty", "-e", "herdr"], {"renderer": "egl"})

        self.assertEqual(argv, ["/opt/VirtualGL/bin/vglrun", "-d", "egl0", "ghostty", "-e", "herdr"])
        self.assertEqual(env["DISPLAY"], ":121")
        self.assertEqual(env["DBUS_SESSION_BUS_ADDRESS"], "unix:path=/run/user/502/bus")
        self.assertEqual(env["PATH"].split(":").count("/home/robin/.local/bin"), 1)
