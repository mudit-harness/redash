import importlib.util
import os
from unittest import TestCase

BIN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin")


def _load_script(name):
    """Load one of the release helper scripts in bin/, which is not an importable package."""
    path = os.path.join(BIN_DIR, "{}.py".format(name))
    spec = importlib.util.spec_from_file_location("bin_{}".format(name), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


get_changes = _load_script("get_changes")


class TestValidateGitRevision(TestCase):
    def test_accepts_shas_and_ref_names(self):
        for revision in (
            "a1b2c3d",
            "0123456789abcdef0123456789abcdef01234567",
            "master",
            "v10.1.0",
            "release/10.x",
            "fix_something-2",
        ):
            self.assertEqual(revision, get_changes.validate_git_revision(revision))

    def test_rejects_values_git_would_read_as_options(self):
        for revision in (
            "--output=/tmp/pwned",
            "--upload-pack=touch /tmp/pwned",
            "-n1",
        ):
            with self.assertRaises(ValueError):
                get_changes.validate_git_revision(revision)

    def test_rejects_other_unsafe_revisions(self):
        for revision in (
            "",
            "master..dev",
            "master:file",
            "HEAD^{tree}",
            "master dev",
            ".hidden",
            None,
        ):
            with self.assertRaises(ValueError):
                get_changes.validate_git_revision(revision)
