"""Timezone-aware UTC timestamps for the SQLite-backed models (calvin-vcy).

SQLite has no timezone-aware datetime type. SQLAlchemy's SQLite dialect writes
an aware datetime by dropping its offset and reads a naive datetime back, so a
column that mixes old ``datetime.utcnow()`` rows with new ``datetime.now(UTC)``
values raises ``TypeError: can't compare offset-naive and offset-aware
datetimes`` as soon as the two are compared in Python.

The convention implemented here keeps the stored bytes exactly as they were:

* **write**: the value is normalised to UTC and stored as naive UTC text;
* **read**: the naive value from SQLite is returned with ``tzinfo=UTC`` attached.

Old rows therefore keep their meaning (they always were UTC) and compare
cleanly against a fresh :func:`utcnow`. Use :class:`UTCDateTime` for ormar
datetime columns and :func:`utcnow` for every new timestamp value.
"""

from datetime import UTC, datetime

import ormar
import sqlalchemy


def utcnow() -> datetime:
    """Return the current time as a timezone-aware UTC datetime."""
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """Return ``value`` as an aware UTC datetime; a naive value is assumed UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class UTCDateTimeType(sqlalchemy.TypeDecorator):
    """Store naive UTC text; return aware UTC datetimes on read."""

    impl = sqlalchemy.DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        # Strip the offset the same way the sqlite dialect always did, so rows
        # written by older versions and new rows share one storage format.
        return as_utc(value).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return as_utc(value)


class UTCDateTime(ormar.DateTime):
    """Ormar datetime field backed by :class:`UTCDateTimeType`."""

    @classmethod
    def get_column_type(cls, **kwargs) -> sqlalchemy.types.TypeEngine:
        return UTCDateTimeType()
