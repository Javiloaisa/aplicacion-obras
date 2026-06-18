// Display helpers

/** Decimal hours (e.g. 8.63) → "8h 38m" for display. Minutes padded to 2 digits. */
export function formatHours(value: number | string): string {
  const totalMinutes = Math.round(Number(value) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
