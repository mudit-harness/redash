from unittest import TestCase
from unittest.mock import MagicMock, patch

import pytest

from redash.query_runner.mysql import Mysql, enabled

pytestmark = pytest.mark.skipif(not enabled, reason="mysqlclient isn't installed")


class TestMysqlCancel(TestCase):
    def setUp(self) -> None:
        self.runner = Mysql({"host": "127.0.0.1", "db": "test"})

    def test_kills_thread_with_bound_parameter(self):
        connection = MagicMock()
        with patch.object(Mysql, "_connection", return_value=connection):
            error = self.runner._cancel(42)

        self.assertIsNone(error)
        connection.cursor.return_value.execute.assert_called_once_with("KILL %s", (42,))

    def test_does_not_kill_with_non_numeric_thread_id(self):
        connection = MagicMock()
        with patch.object(Mysql, "_connection", return_value=connection):
            with pytest.raises(ValueError):
                self.runner._cancel("1; DROP TABLE users")

        connection.cursor.return_value.execute.assert_not_called()
