import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { Button, ErrorMessage, Field, Input, Textarea } from "../components/ui";
import { apiSend, SessionExpiredError } from "../lib/api";
import { formatHours } from "../lib/format";
import type { WorkEntry } from "../lib/types";

function computedHours(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : null;
}

/**
 * Edit one of the worker's own partes. The entry is passed via router state
 * from the Historial list; a worker may edit it freely until the admin
 * validates it. Once validated, the entry is read-only (enforced by the API).
 */
export default function EditarParte() {
  const navigate = useNavigate();
  const location = useLocation();
  const entry = (location.state as { entry?: WorkEntry } | null)?.entry;

  // Reached without an entry (direct URL / reload): nothing to edit.
  if (!entry || entry.validated) {
    return (
      <Layout title="Editar parte" back="/historial">
        <p className="py-12 text-center text-lg text-gray-500">
          Este parte ya no se puede editar.
        </p>
      </Layout>
    );
  }

  return <EditForm entry={entry} navigate={navigate} />;
}

function EditForm({
  entry,
  navigate,
}: {
  entry: WorkEntry;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const hadTimes = Boolean(entry.start_time && entry.end_time);
  const [mode, setMode] = useState<"times" | "manual">(hadTimes ? "times" : "manual");
  const [workDate, setWorkDate] = useState(entry.work_date);
  const [startTime, setStartTime] = useState(entry.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(entry.end_time?.slice(0, 5) ?? "");
  const [hours, setHours] = useState(String(Number(entry.hours)));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const preview = mode === "times" ? computedHours(startTime, endTime) : null;

  function fail(err: unknown, fallback: string) {
    if (err instanceof SessionExpiredError) {
      navigate("/login", { replace: true });
      return;
    }
    setError(err instanceof Error ? err.message : fallback);
    setBusy(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const body =
      mode === "times"
        ? { work_date: workDate, start_time: startTime, end_time: endTime, notes: notes || null }
        : { work_date: workDate, hours: Number(hours), notes: notes || null };
    try {
      await apiSend("PATCH", `/api/v1/entries/${entry.id}`, body);
      navigate("/historial", { replace: true });
    } catch (err) {
      fail(err, "No se pudo guardar el parte");
    }
  }

  async function handleDelete() {
    if (!window.confirm("¿Eliminar este parte?")) return;
    setError("");
    setBusy(true);
    try {
      await apiSend("DELETE", `/api/v1/entries/${entry.id}`);
      navigate("/historial", { replace: true });
    } catch (err) {
      fail(err, "No se pudo eliminar el parte");
    }
  }

  return (
    <Layout title="Editar parte" back="/historial">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl bg-gray-100 p-3 text-base text-gray-600">
          Obra: <span className="font-semibold text-gray-900">{entry.obra_name}</span>
        </div>

        <Field label="Fecha">
          <Input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-200 p-1">
          {(
            [
              ["times", "Inicio y fin"],
              ["manual", "Horas directas"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`min-h-12 rounded-lg text-base font-semibold ${
                mode === value ? "bg-white text-gray-900 shadow" : "text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "times" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hora inicio">
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </Field>
              <Field label="Hora fin">
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </Field>
            </div>
            {preview !== null ? (
              <p className="text-center text-lg font-semibold text-brand-600">
                {formatHours(preview)}
              </p>
            ) : null}
          </>
        ) : (
          <Field label="Horas trabajadas">
            <Input
              type="number"
              inputMode="decimal"
              min={0.25}
              max={16}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </Field>
        )}

        <Field label="Notas (opcional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ej.: alicatado baño planta 1"
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button type="button" variant="danger" onClick={handleDelete} disabled={busy}>
          🗑️ Eliminar parte
        </Button>
      </form>
    </Layout>
  );
}
