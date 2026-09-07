from unittest import TestCase

import pytest

from redash.utils.sql import (
    InvalidIdentifierError,
    quote_identifier,
    validate_identifier,
)


class TestValidateIdentifier(TestCase):
    def test_accepts_plain_identifier(self):
        self.assertEqual("my_database$1", validate_identifier("my_database$1"))

    def test_strips_surrounding_whitespace(self):
        self.assertEqual("my_database", validate_identifier(" my_database "))

    def test_accepts_quoted_identifier(self):
        self.assertEqual('"My Database"', validate_identifier('"My Database"'))

    def test_accepts_qualified_identifier_when_dots_are_allowed(self):
        self.assertEqual("db.schema", validate_identifier("db.schema", allow_dots=True))

    def test_rejects_qualified_identifier_by_default(self):
        with pytest.raises(InvalidIdentifierError):
            validate_identifier("db.schema")

    def test_rejects_statement_separator(self):
        with pytest.raises(InvalidIdentifierError):
            validate_identifier("db; DROP TABLE users")

    def test_rejects_quote_breakout(self):
        with pytest.raises(InvalidIdentifierError):
            validate_identifier('"db"; DROP TABLE users --"', allow_dots=True)

    def test_rejects_comment(self):
        with pytest.raises(InvalidIdentifierError):
            validate_identifier("db -- comment")

    def test_rejects_empty_and_non_string_values(self):
        for value in ["", "   ", None, 42]:
            with pytest.raises(InvalidIdentifierError):
                validate_identifier(value)


class TestQuoteIdentifier(TestCase):
    def test_quotes_identifier(self):
        self.assertEqual('"uuid-ossp"', quote_identifier("uuid-ossp"))

    def test_escapes_embedded_quotes(self):
        self.assertEqual('"a""; DROP TABLE users; --"', quote_identifier('a"; DROP TABLE users; --'))

    def test_rejects_nul_character(self):
        with pytest.raises(InvalidIdentifierError):
            quote_identifier("a\x00b")

    def test_rejects_empty_and_non_string_values(self):
        for value in ["", "   ", None, 42]:
            with pytest.raises(InvalidIdentifierError):
                quote_identifier(value)
