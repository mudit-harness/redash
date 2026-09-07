from unittest import TestCase

from redash import settings


class TestRequestsTimeouts(TestCase):
    """The shared (connect, read) timeouts every outgoing requests call passes."""

    def test_timeouts_are_connect_read_tuples(self):
        for timeout in (settings.REQUESTS_TIMEOUT, settings.REQUESTS_SHORT_TIMEOUT):
            self.assertIsInstance(timeout, tuple)
            self.assertEqual(2, len(timeout))
            for value in timeout:
                self.assertIsInstance(value, float)
                self.assertGreater(value, 0)

    def test_connecting_is_stricter_than_reading(self):
        # Connecting to a reachable host is fast, reading a result may not be.
        for connect_timeout, read_timeout in (settings.REQUESTS_TIMEOUT, settings.REQUESTS_SHORT_TIMEOUT):
            self.assertLessEqual(connect_timeout, read_timeout)

    def test_short_timeout_is_tighter_than_the_default_one(self):
        # Query runners may wait minutes for an analytics engine, request/task paths may not.
        self.assertLess(settings.REQUESTS_SHORT_TIMEOUT[0], settings.REQUESTS_TIMEOUT[0])
        self.assertLess(settings.REQUESTS_SHORT_TIMEOUT[1], settings.REQUESTS_TIMEOUT[1])
