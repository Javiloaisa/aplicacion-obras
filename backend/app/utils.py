from datetime import datetime, timezone


def ensure_utc(dt: datetime) -> datetime:
    """Treat naive datetimes (e.g. from SQLite) as UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
