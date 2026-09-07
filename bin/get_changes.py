#!/bin/env python3

import re
import subprocess
import sys

# A revision may only contain characters that can legitimately appear in a git SHA or
# ref name, and has to start with an alphanumeric character so that git can never parse
# a caller supplied revision as a command line option (argument injection).
GIT_REVISION_RE = re.compile(r"\A[0-9A-Za-z][0-9A-Za-z._/-]*\Z")


def validate_git_revision(revision):
    """Return revision unchanged if it is safe to pass to git, raise ValueError otherwise."""
    if not isinstance(revision, str) or ".." in revision or not GIT_REVISION_RE.match(revision):
        raise ValueError("Refusing to pass unsafe git revision to git: {!r}".format(revision))

    return revision


def get_change_log(previous_sha):
    args = [
        "git",
        "--no-pager",
        "log",
        "--merges",
        "--grep",
        "Merge pull request",
        '--pretty=format:"%h|%s|%b|%p"',
        "master...{}".format(validate_git_revision(previous_sha)),
        # Everything before "--" is an option or a revision, never a path: this keeps git
        # from guessing, and the validation above keeps a revision from looking like an option.
        "--",
    ]
    log = subprocess.check_output(args, text=True)
    changes = []

    for line in log.split("\n"):
        try:
            sha, subject, body, parents = line[1:-1].split("|")
        except ValueError:
            continue

        try:
            pull_request = re.match(r"Merge pull request #(\d+)", subject).groups()[0]
            pull_request = " #{}".format(pull_request)
        except Exception:
            pull_request = ""

        parent = validate_git_revision(parents.split(" ")[-1])
        author = subprocess.check_output(
            ["git", "log", "-1", '--pretty=format:"%an"', parent, "--"],
            text=True,
        )[1:-1]

        changes.append("{}{}: {} ({})".format(sha, pull_request, body.strip(), author))

    return changes


if __name__ == "__main__":
    previous_sha = sys.argv[1]
    changes = get_change_log(previous_sha)

    for change in changes:
        print(change)
