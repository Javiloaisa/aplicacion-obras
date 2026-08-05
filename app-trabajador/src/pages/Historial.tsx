import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { EmptyState, ErrorMessage, Spinner } from "../components/ui";
import { apiGet } from "../lib/api";
import { formatHours } from "../lib/format";
import type { EntriesList, WorkEntry } from "../lib/types";

function toISO(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

type Period = "week" | "month" | "last_month";

function rangeFor(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = toISO(now);
  if (period === "week") {
    // Monday of the current week
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    return { from: toISO(monday), to };
  }
  if (period === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISO(first), to };
  }
  // Previous month, whole month: day 0 of this month is its last day
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: toISO(first), to: toISO(last) };
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function Historial() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<EntriesList | null>(null);
  const [error, setError] = useState("");

  function editEntry(entry: WorkEntry) {
    navigate("/historial/editar", { state: { entry } });
  }

  useEffect(() => {
    setData(null);
    setError("");
    const { from, to } = rangeFor(period);
    apiGet<EntriesList>(`/api/v1/entries/mine?from=${from}&to=${to}`)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar el historial"),
      );
  }, [period]);

  return (
    <Layout title="Mis horas" back="/">
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-200 p-1">
        {(
          [
            ["week", "Esta semana"],
            ["month", "Este mes"],
            ["last_month", "Mes pasado"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            className={`min-h-12 rounded-lg px-1 text-sm font-semibold ${
              period === value ? "bg-white text-gray-900 shadow" : "text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {!error && data === null ? <Spinner /> : null}

      {data ? (
        <>
          <div className="mb-4 rounded-2xl bg-gray-900 p-5 text-center text-white">
            <div className="text-4xl font-bold">{formatHours(data.total_hours)}</div>
            <div className="text-gray-300">
              {data.count} {data.count === 1 ? "parte" : "partes"}
            </div>
          </div>

          {data.items.length === 0 ? (
            <EmptyState>No hay partes en este periodo.</EmptyState>
          ) : (
            <div className="space-y-2">
              {data.items.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-gray-900">
                      {formatDate(entry.work_date)}
                    </span>
                    <span className="text-lg font-bold text-brand-600">
                      {formatHours(entry.hours)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">{entry.obra_name}</div>
                  {entry.notes ? (
                    <div className="mt-1 text-base text-gray-600">{entry.notes}</div>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {entry.validated ? (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                        ✓ Validado
                      </span>
                    ) : (
                      <>
                        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                          Pendiente de validar
                        </span>
                        <button
                          type="button"
                          onClick={() => editEntry(entry)}
                          className="min-h-10 rounded-lg border border-gray-300 bg-white px-4 text-base font-semibold text-gray-800 active:bg-gray-100"
                        >
                          ✏️ Editar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </Layout>
  );
}
