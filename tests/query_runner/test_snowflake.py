from unittest import TestCase
from unittest.mock import MagicMock, patch

import pytest

from redash.query_runner.snowflake import Snowflake
from redash.utils.sql import InvalidIdentifierError


def _runner(warehouse="warehouse1", database="db1"):
    return Snowflake(
        {
            "account": "account1",
            "user": "user1",
            "password": "password1",
            "warehouse": warehouse,
            "database": database,
        }
    )


class TestSnowflakeIdentifiers(TestCase):
    def _executed_statements(self, runner, method, *args):
        connection = MagicMock()
        with patch.object(Snowflake, "_get_connection", return_value=connection):
            with patch.object(Snowflake, "_parse_results", return_value={"columns": [], "rows": []}):
                method(runner, *args)

        cursor = connection.cursor.return_value
        return [call[0][0] for call in cursor.execute.call_args_list]

    def test_uses_configured_warehouse_and_database(self):
        statements = self._executed_statements(_runner(), Snowflake.run_query, "SELECT 1", None)
        self.assertEqual(["USE WAREHOUSE warehouse1", "USE db1", "SELECT 1"], statements)

    def test_supports_database_with_schema(self):
        runner = _runner(database="db1.schema1")
        statements = self._executed_statements(runner, Snowflake._run_query_without_warehouse, "SHOW COLUMNS")
        self.assertEqual(["USE db1.schema1", "SHOW COLUMNS"], statements)

    def test_rejects_unsafe_warehouse(self):
        runner = _runner(warehouse="warehouse1; DROP TABLE users")
        with patch.object(Snowflake, "_get_connection") as get_connection:
            with pytest.raises(InvalidIdentifierError):
                runner.run_query("SELECT 1", None)
            get_connection.assert_not_called()

    def test_rejects_unsafe_database(self):
        runner = _runner(database="db1; DROP TABLE users")
        with patch.object(Snowflake, "_get_connection") as get_connection:
            with pytest.raises(InvalidIdentifierError):
                runner.run_query("SELECT 1", None)
            with pytest.raises(InvalidIdentifierError):
                runner._run_query_without_warehouse("SHOW COLUMNS")
            get_connection.assert_not_called()
