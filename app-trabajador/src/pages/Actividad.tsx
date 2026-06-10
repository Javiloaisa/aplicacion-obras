import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AuthImg from "../components/AuthImg";
import Layout from "../components/Layout";
import { EmptyState, ErrorMessage, Spinner } from "../components/ui";
import { apiGet } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import type { EntriesList, MediaList } from "../lib/types";

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function Actividad() {
  const { obraId } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState<"partes" | "media">("partes");
  const [entries, setEntries] = useState<EntriesList | null>(null);
  const [media, setMedia] = useState<MediaList | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiGet<EntriesList>(`/api/v1/obras/${obraId}/entries`),
      apiGet<MediaList>(`/api/v1/obras/${obraId}/media?user_id=${user.id}`),
    ])
      .then(([entriesData, mediaData]) => {
        setEntries(entriesData);
        setMedia(mediaData);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar la actividad"),
      );
  }, [obraId, user]);

  const loading = !error && (entries === null || media === null);

  return (
    <Layout title="Mi actividad" back={`/obras/${obraId}`}>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-200 p-1">
        {(
          [
            ["partes", `Partes${entries ? ` (${entries.count})` : ""}`],
            ["media", `Fotos/vídeos${media ? ` (${media.total})` : ""}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`min-h-12 rounded-lg text-base font-semibold ${
              tab === value ? "bg-white text-gray-900 shadow" : "text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {loading ? <Spinner /> : null}

      {tab === "partes" && entries ? (
        entries.items.length === 0 ? (
          <EmptyState>Todavía no has registrado partes en esta obra.</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-center text-lg font-semibold text-amber-600">
              Total: {entries.total_hours} h
            </p>
            <div className="space-y-2">
              {entries.items.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-gray-900">
                      {formatDate(entry.work_date)}
                    </span>
                    <span className="text-lg font-bold text-amber-600">
                      {entry.hours} h
                    </span>
                  </div>
                  {entry.start_time && entry.end_time ? (
                    <div className="text-sm text-gray-500">
                      {entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)}
                    </div>
                  ) : null}
                  {entry.notes ? (
                    <div className="mt-1 text-base text-gray-600">{entry.notes}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )
      ) : null}

      {tab === "media" && media ? (
        media.items.length === 0 ? (
          <EmptyState>Todavía no has subido fotos ni vídeos a esta obra.</EmptyState>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {media.items.map((item) => (
              <div
                key={item.id}
                className="relative aspect-square overflow-hidden rounded-xl bg-gray-200"
              >
                {item.thumb_url ? (
                  <AuthImg
                    src={item.thumb_url}
                    alt={item.caption ?? item.original_filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">
                    {item.kind === "video" ? "🎬" : "📷"}
                  </div>
                )}
                {item.kind === "video" ? (
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-xs text-white">
                    🎬
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </Layout>
  );
}
