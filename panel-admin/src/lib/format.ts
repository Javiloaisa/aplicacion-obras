// Display helpers — dates shown in Europe/Madrid, stored in UTC

export function toISODate(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Monday of the current week → today. */
export function thisWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day - 1));
  return { from: toISODate(monday), to: toISODate(now) };
}

/** First day of the current month → today. */
export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Decimal hours (e.g. 8.63) → "8h 38m" for display. Minutes padded to 2 digits. */
export function formatHours(value: number | string): string {
  const totalMinutes = Math.round(Number(value) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
