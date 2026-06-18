"""Display formatting helpers shared by reports and exports."""
from decimal import ROUND_HALF_UP, Decimal


def hours_hm(value) -> str:
    """Decimal hours (e.g. 8.63) -> '8h 38m'. Minutes padded to 2 digits.

    Returns '—' for None.
    """
    if value is None:
        return "—"
    total_minutes = int((Decimal(str(value)) * 60).to_integral_value(rounding=ROUND_HALF_UP))
    h, m = divmod(total_minutes, 60)
    return f"{h}h {m:02d}m"
