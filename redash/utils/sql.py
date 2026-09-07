"""Helpers for safely embedding identifiers into SQL statements.

Values such as database, schema, table, warehouse or extension names end up in
*identifier* positions (``USE <database>``, ``INSTALL <extension>``,
``CREATE TABLE <name>``, ...), where databases do not accept bind parameters.
Instead of concatenating such a value into a statement as-is, it has to be
validated and/or quoted, so it can never break out of the identifier position
and inject arbitrary SQL.

Value (non identifier) positions must always use bound parameters instead.
"""

import re

# An identifier that needs no quoting: an ASCII letter or underscore, followed by
# letters, digits, underscores or dollar signs. This is the common subset
# accepted unquoted by the databases Redash connects to.
UNQUOTED_IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_$]*")

# An already quoted identifier, e.g. `"My Database"`. Double quotes inside the
# value are rejected, as they could be used to terminate the identifier early.
QUOTED_IDENTIFIER_RE = re.compile(r'"[^"\x00]+"')


class InvalidIdentifierError(ValueError):
    """Raised when a value can't be safely used as an SQL identifier."""


def validate_identifier(value, kind="identifier", allow_dots=False):
    """Return the stripped `value` if it is safe to use as an SQL identifier.

    A value is considered safe when it is either a plain identifier
    (`my_database`) or an already quoted one (`"my database"`). Pass
    `allow_dots=True` for qualified names such as `database.schema`, in which
    case every dot separated part is validated on its own.

    Raises `InvalidIdentifierError` for anything else, so that statements built
    with the returned value fail closed instead of executing injected SQL.
    """
    if not isinstance(value, str) or not value.strip():
        raise InvalidIdentifierError("Invalid {}: a non-empty string is required.".format(kind))

    value = value.strip()
    parts = value.split(".") if allow_dots else [value]

    for part in parts:
        if not (UNQUOTED_IDENTIFIER_RE.fullmatch(part) or QUOTED_IDENTIFIER_RE.fullmatch(part)):
            raise InvalidIdentifierError("Invalid {}: {!r} is not a valid SQL identifier.".format(kind, value))

    return value


def quote_identifier(value, kind="identifier"):
    """Return the stripped `value` as a double quoted SQL identifier.

    Double quotes inside the value are escaped by doubling them, which is the
    standard SQL escaping for quoted identifiers. This keeps the value confined
    to a single identifier even when it contains characters that would
    otherwise terminate the statement.
    """
    if not isinstance(value, str) or not value.strip():
        raise InvalidIdentifierError("Invalid {}: a non-empty string is required.".format(kind))

    value = value.strip()

    if "\x00" in value:
        raise InvalidIdentifierError("Invalid {}: NUL characters are not allowed.".format(kind))

    return '"{}"'.format(value.replace('"', '""'))
