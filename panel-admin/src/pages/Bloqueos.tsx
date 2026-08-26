import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarOff, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate, todayISO } from "@/lib/format";
import type { BlockedDay, User } from "@/lib/types";

type Mode = "single" | "range";

/** Weekdays in Spanish order (Monday first); `day` matches Date.getDay(). */
const WEEKDAYS = [
  { day: 1, short: "L", label: "lunes" },
  { day: 2, short: "M", label: "martes" },
  { day: 3, short: "X", label: "miércoles" },
  { day: 4, short: "J", label: "jueves" },
  { day: 5, short: "V", label: "viernes" },
  { day: 6, short: "S", label: "sábados" },
  { day: 0, short: "D", label: "domingos" },
];

const MAX_DATES = 366;

function toLocalISO(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Every date between `from` and `to` (inclusive) falling on one of `weekdays`. */
function expandRange(from: string, to: string, weekdays: Set<number>): string[] {
  if (!from || !to || weekdays.size === 0) return [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length <= MAX_DATES) {
    if (weekdays.has(cursor.getDay())) dates.push(toLocalISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** 31st December of the current year, as a sensible default end of range. */
function endOfYearISO(): string {
  return `${new Date().getFullYear()}-12-31`;
}

interface DayGroup {
  date: string;
  rows: BlockedDay[];
  notes: string[];
}

/** One row per blocked date, keeping the API's date-descending order. */
function groupByDate(rows: BlockedDay[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const row of rows) {
    let group = groups.get(row.blocked_date);
    if (!group) {
      group = { date: row.blocked_date, rows: [], notes: [] };
      groups.set(row.blocked_date, group);
    }
    group.rows.push(row);
    if (row.note && !group.notes.includes(row.note)) group.notes.push(row.note);
  }
  return [...groups.values()];
}

export default function Bloqueos() {
  const [workers, setWorkers] = useState<User[]>([]);
  const [bloqueos, setBloqueos] = useState<BlockedDay[]>([]);
  const [mode, setMode] = useState<Mode>("single");
  const [blockedDate, setBlockedDate] = useState(todayISO());
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(endOfYearISO());
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiGet<User[]>("/api/v1/usuarios")
      .then((users) =>
        setWorkers(users.filter((u) => u.role === "worker" && u.is_active)),
      )
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    apiGet<BlockedDay[]>("/api/v1/bloqueos")
      .then(setBloqueos)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar los bloqueos"),
      );
  }, []);

  useEffect(load, [load]);

  const dates = useMemo(
    () =>
      mode === "single"
        ? blockedDate
          ? [blockedDate]
          : []
        : expandRange(fromDate, toDate, weekdays),
    [mode, blockedDate, fromDate, toDate, weekdays],
  );

  const tooManyDates = dates.length > MAX_DATES;

  const groups = useMemo(() => groupByDate(bloqueos), [bloqueos]);

  function toggleWorker(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = workers.length > 0 && selected.size === workers.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(workers.map((w) => w.id)));
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function submit() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const created = await apiSend<BlockedDay[]>("POST", "/api/v1/bloqueos", {
        blocked_dates: dates,
        user_ids: [...selected],
        note: note.trim() || null,
      });
      const skipped = dates.length * selected.size - created.length;
      setSuccess(
        created.length === 0
          ? "Esos días ya estaban bloqueados para esos trabajadores."
          : `Se han creado ${created.length} bloqueos.` +
              (skipped > 0 ? ` ${skipped} ya existían y se han omitido.` : ""),
      );
      setSelected(new Set());
      setWeekdays(new Set());
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el bloqueo");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("¿Quitar este bloqueo? El trabajador podrá volver a registrar partes ese día.")) return;
    try {
      await apiSend("DELETE", `/api/v1/bloqueos/${id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el bloqueo");
    }
  }

  async function removeDay(group: DayGroup) {
    const count = group.rows.length;
    if (
      !window.confirm(
        `¿Quitar el bloqueo del ${formatDate(group.date)} para ${count} ` +
          `${count === 1 ? "trabajador" : "trabajadores"}? Podrán volver a ` +
          "registrar partes ese día.",
      )
    )
      return;
    setError("");
    try {
      await apiSend("DELETE", `/api/v1/bloqueos?date=${group.date}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el bloqueo");
    }
  }

  function toggleExpanded(date: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <Layout title="Días bloqueados">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Un trabajador no puede registrar ni mover partes a un día bloqueado. Úsalo
        cuando alguien no venga a trabajar, para evitar que luego meta partes
        atrasados de ese día. Tú siempre puedes crear o editar partes, aunque el día
        esté bloqueado.
      </p>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">Bloquear días</h2>

        <div className="mb-4 inline-flex rounded-md border p-1">
          {(
            [
              { value: "single", label: "Un día" },
              { value: "range", label: "Varios días" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setMode(option.value);
                setSuccess("");
              }}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                mode === option.value
                  ? "bg-brand-500 font-medium text-ink-900"
                  : "hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="blocked-date">Fecha</Label>
              <Input
                id="blocked-date"
                type="date"
                value={blockedDate}
                onChange={(e) => setBlockedDate(e.target.value)}
              />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label htmlFor="note">Nota (opcional)</Label>
              <Input
                id="note"
                value={note}
                maxLength={200}
                placeholder="p. ej. No vino a trabajar"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="from-date">Desde</Label>
                <Input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to-date">Hasta</Label>
                <Input
                  id="to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="note-range">Nota (opcional)</Label>
                <Input
                  id="note-range"
                  value={note}
                  maxLength={200}
                  placeholder="p. ej. Domingos"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Repetir estos días de la semana</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((wd) => (
                  <button
                    key={wd.day}
                    type="button"
                    title={wd.label}
                    onClick={() => toggleWeekday(wd.day)}
                    className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                      weekdays.has(wd.day)
                        ? "border-brand-500 bg-brand-500/10 text-brand-700"
                        : "hover:bg-muted"
                    }`}
                  >
                    {wd.short}
                  </button>
                ))}
              </div>
              <p className="pt-1 text-sm text-muted-foreground">
                {weekdays.size === 0
                  ? "Elige al menos un día de la semana."
                  : dates.length === 0
                    ? "No hay días que coincidan en ese rango de fechas."
                    : `Se bloquearán ${dates.length} ${
                        dates.length === 1 ? "día" : "días"
                      }: del ${formatDate(dates[0])} al ${formatDate(
                        dates[dates.length - 1],
                      )}.`}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <Label>Trabajadores</Label>
            {workers.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                {allSelected ? "Quitar selección" : "Seleccionar todos"}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {workers.map((w) => (
              <label
                key={w.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  selected.has(w.id)
                    ? "border-brand-500 bg-brand-500/10 font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={selected.has(w.id)}
                  onChange={() => toggleWorker(w.id)}
                />
                {w.full_name}
              </label>
            ))}
            {workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay trabajadores activos.</p>
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-brand-700">{success}</p> : null}
        {tooManyDates ? (
          <p className="mt-3 text-sm text-destructive">
            Demasiados días de una vez (máximo {MAX_DATES}). Acorta el rango de fechas.
          </p>
        ) : null}

        <Button
          className="mt-4"
          disabled={saving || selected.size === 0 || dates.length === 0 || tooManyDates}
          onClick={submit}
        >
          <CalendarOff />
          Bloquear {dates.length} {dates.length === 1 ? "día" : "días"} para{" "}
          {selected.size} {selected.size === 1 ? "trabajador" : "trabajadores"}
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Fecha</TableHead>
              <TableHead>Trabajadores</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const isOpen = expanded.has(group.date);
              return [
                <TableRow
                  key={group.date}
                  className="cursor-pointer"
                  onClick={() => toggleExpanded(group.date)}
                >
                  <TableCell className="text-muted-foreground">
                    {isOpen ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {formatDate(group.date)}
                  </TableCell>
                  <TableCell>
                    {group.rows.length}{" "}
                    {group.rows.length === 1 ? "trabajador" : "trabajadores"}
                    <span className="ml-2 text-muted-foreground">
                      {group.rows
                        .slice(0, 3)
                        .map((r) => r.user_full_name)
                        .join(", ")}
                      {group.rows.length > 3 ? "…" : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {group.notes.length > 0 ? group.notes.join(" · ") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDay(group);
                      }}
                      title="Quitar el día entero"
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>,
                ...(isOpen
                  ? group.rows.map((b) => (
                      <TableRow key={b.id} className="bg-muted/40">
                        <TableCell />
                        <TableCell />
                        <TableCell className="pl-6">{b.user_full_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.note ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(b.id)}
                            title="Quitar solo a este trabajador"
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  : []),
              ];
            })}
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No hay días bloqueados.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
