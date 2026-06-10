import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { Button, ErrorMessage, Field, Input, Textarea } from "../components/ui";
import { apiSend } from "../lib/api";
import { enqueue, isRetryable } from "../lib/offline-queue";
import type { WorkEntry } from "../lib/types";

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

function computedHours(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : null;
}

export default function Parte() {
  const { obraId } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"times" | "manual">("times");
  const [workDate, setWorkDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<"sent" | "queued" | null>(null);

  const preview = mode === "times" ? computedHours(startTime, endTime) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const body =
      mode === "times"
        ? { work_date: workDate, start_time: startTime, end_time: endTime, notes: notes || null }
        : { work_date: workDate, hours: Number(hours), notes: notes || null };
    try {
      await apiSend<WorkEntry>("POST", `/api/v1/obras/${obraId}/entries`, body);
      setSaved("sent");
      setTimeout(() => navigate(`/obras/${obraId}`, { replace: true }), 900);
    } catch (err) {
      if (isRetryable(err) && obraId) {
        // No connection: queue it and let the worker move on
        await enqueue({ kind: "entry", obraId, body, createdAt: Date.now() });
        setSaved("queued");
        setTimeout(() => navigate(`/obras/${obraId}`, { replace: true }), 1400);
        return;
      }
      setError(err instanceof Error ? err.message : "No se pudo guardar el parte");
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Layout title="Parte de horas" back={`/obras/${obraId}`}>
        <div className="py-16 text-center">
          <div className="mb-3 text-6xl">{saved === "sent" ? "✅" : "⏳"}</div>
          <p className="text-xl font-semibold text-gray-900">
            {saved === "sent"
              ? "Parte guardado"
              : "Sin conexión: se enviará automáticamente"}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Parte de horas" back={`/obras/${obraId}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Fecha">
          <Input
            type="date"
            value={workDate}
            max={todayISO()}
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
              <p className="text-center text-lg font-semibold text-amber-600">
                {preview} horas
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
              placeholder="8"
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
          {busy ? "Guardando..." : "Guardar parte"}
        </Button>
      </form>
    </Layout>
  );
}
