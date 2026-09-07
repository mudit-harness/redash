import os
import subprocess

from redash.query_runner import BaseQueryRunner, register


def query_to_script_path(path, query):
    if path == "*":
        return query

    arguments = query.strip().split(" ")
    script_name = arguments[0]
    if not script_name:
        raise IOError("No script specified")

    # The query is user supplied, so the script it resolves to must stay inside the
    # configured scripts directory: reject absolute paths, "../" and symlinks that
    # point outside of it.
    scripts_directory = os.path.realpath(path)
    script = os.path.join(path, script_name)
    if os.path.commonpath([scripts_directory, os.path.realpath(script)]) != scripts_directory:
        raise IOError("Script '{}' is outside of the script directory".format(query))

    if not os.path.exists(script):
        raise IOError("Script '{}' not found in script directory".format(query))

    return [script] + arguments[1:]


def run_script(script, shell):
    output = subprocess.check_output(script, shell=shell)
    if output is None:
        return None, "Error reading output"

    output = output.strip()
    if not output:
        return None, "Empty output from script"

    return output, None


class Script(BaseQueryRunner):
    should_annotate_query = False

    @classmethod
    def enabled(cls):
        return "check_output" in subprocess.__dict__

    @classmethod
    def configuration_schema(cls):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "title": "Scripts path"},
                "shell": {
                    "type": "boolean",
                    "title": "Execute command through the shell",
                },
            },
            "required": ["path"],
        }

    @classmethod
    def type(cls):
        return "insecure_script"

    def __init__(self, configuration):
        super(Script, self).__init__(configuration)

        path = self.configuration.get("path", "")
        # If path is * allow any execution path
        if path == "*":
            return

        # Poor man's protection against running scripts from outside the scripts directory
        if path.find("../") > -1:
            raise ValueError("Scripts can only be run from the configured scripts directory")

    def test_connection(self):
        pass

    def run_query(self, query, user):
        try:
            path = self.configuration["path"]
            script = query_to_script_path(path, query)
            # The shell option can only apply to the free form ("*") mode, where the query
            # itself is the command line. A script resolved inside the configured directory
            # is executed as an argument vector, so the query is never parsed by a shell.
            shell = path == "*" and self.configuration.get("shell", False)
            return run_script(script, shell)
        except IOError as e:
            return None, str(e)
        except subprocess.CalledProcessError as e:
            return None, str(e)


register(Script)
