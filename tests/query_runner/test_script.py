import os
import subprocess

from _pytest.monkeypatch import MonkeyPatch

from redash.query_runner import script as script_module
from redash.query_runner.script import Script, query_to_script_path, run_script
from tests import BaseTestCase


class TestQueryToScript(BaseTestCase):
    monkeypatch = MonkeyPatch()

    def test_unspecified(self):
        self.assertEqual("/foo/bar/baz.sh", query_to_script_path("*", "/foo/bar/baz.sh"))

    def test_specified(self):
        self.assertRaises(IOError, lambda: query_to_script_path("/foo/bar", "baz.sh"))

        self.monkeypatch.setattr(os.path, "exists", lambda x: True)
        self.assertEqual(["/foo/bar/baz.sh"], query_to_script_path("/foo/bar", "baz.sh"))

    def test_keeps_script_arguments(self):
        self.monkeypatch.setattr(os.path, "exists", lambda x: True)
        self.assertEqual(["/foo/bar/baz.sh", "arg1", "arg2"], query_to_script_path("/foo/bar", "baz.sh arg1 arg2"))

    def test_rejects_paths_outside_of_the_scripts_directory(self):
        self.monkeypatch.setattr(os.path, "exists", lambda x: True)
        self.assertRaises(IOError, lambda: query_to_script_path("/foo/bar", "../../bin/sh"))
        self.assertRaises(IOError, lambda: query_to_script_path("/foo/bar", "../baz.sh -c whoami"))
        self.assertRaises(IOError, lambda: query_to_script_path("/foo/bar", "/bin/sh"))
        self.assertRaises(IOError, lambda: query_to_script_path("/foo/bar", "   "))


class TestRunScript(BaseTestCase):
    monkeypatch = MonkeyPatch()

    def test_success(self):
        self.monkeypatch.setattr(subprocess, "check_output", lambda script, shell: "test")
        self.assertEqual(("test", None), run_script("/foo/bar/baz.sh", True))

    def test_failure(self):
        self.monkeypatch.setattr(subprocess, "check_output", lambda script, shell: None)
        self.assertEqual((None, "Error reading output"), run_script("/foo/bar/baz.sh", True))
        self.monkeypatch.setattr(subprocess, "check_output", lambda script, shell: "")
        self.assertEqual((None, "Empty output from script"), run_script("/foo/bar/baz.sh", True))
        self.monkeypatch.setattr(subprocess, "check_output", lambda script, shell: " ")
        self.assertEqual((None, "Empty output from script"), run_script("/foo/bar/baz.sh", True))


class TestRunQuery(BaseTestCase):
    monkeypatch = MonkeyPatch()

    def tearDown(self):
        self.monkeypatch.undo()
        super().tearDown()

    def _record_run_script(self):
        calls = []

        def fake_run_script(script, shell):
            calls.append((script, shell))
            return "output", None

        self.monkeypatch.setattr(script_module, "run_script", fake_run_script)
        return calls

    def test_scripts_directory_mode_never_uses_a_shell(self):
        self.monkeypatch.setattr(os.path, "exists", lambda x: True)
        calls = self._record_run_script()

        runner = Script({"path": "/foo/bar", "shell": True})
        self.assertEqual(("output", None), runner.run_query("baz.sh arg1", None))
        self.assertEqual([(["/foo/bar/baz.sh", "arg1"], False)], calls)

    def test_missing_shell_configuration_defaults_to_no_shell(self):
        self.monkeypatch.setattr(os.path, "exists", lambda x: True)
        calls = self._record_run_script()

        runner = Script({"path": "*"})
        self.assertEqual(("output", None), runner.run_query("/foo/bar/baz.sh", None))
        self.assertEqual([("/foo/bar/baz.sh", False)], calls)

    def test_traversal_outside_of_the_scripts_directory_is_reported_as_an_error(self):
        self.monkeypatch.setattr(os.path, "exists", lambda x: True)
        calls = self._record_run_script()

        runner = Script({"path": "/foo/bar", "shell": True})
        output, error = runner.run_query("../../bin/sh", None)
        self.assertIsNone(output)
        self.assertIn("outside of the script directory", error)
        self.assertEqual([], calls)
