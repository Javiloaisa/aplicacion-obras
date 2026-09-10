"""Display formatting helpers shared by reports and exports."""
from decimal import ROUND_HALF_UP, Decimal


def hours_to_minutes(value) -> int:
    """Decimal hours (e.g. 8.63) -> whole minutes (518), rounding half up."""
    return int((Decimal(str(value)) * 60).to_integral_value(rounding=ROUND_HALF_UP))


def hours_hm(value) -> str:
    """Decimal hours (e.g. 8.63) -> '8h 38m'. Minutes padded to 2 digits.

    Returns '—' for None.
    """
    if value is None:
        return "—"
    h, m = divmod(hours_to_minutes(value), 60)
    return f"{h}h {m:02d}m"
