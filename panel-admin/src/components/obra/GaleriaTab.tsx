import { useCallback, useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import AuthImg from "@/components/AuthImg";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiDownload, apiFetch, apiSend } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MediaItem, MediaList, User } from "@/lib/types";

export default function GaleriaTab({
  obraId,
  workers,
}: {
  obraId: string;
  workers: User[];
}) {
  const [data, setData] = useState<MediaList | null>(null);
  const [kind, setKind] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (kind) params.set("kind", kind);
    if (userId) params.set("user_id", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    apiFetch(`/api/v1/obras/${obraId}/media?${params}`)
      .then((res) => res.json())
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar la galería"),
      );
  }, [obraId, kind, userId, from, to, page]);

  useEffect(load, [load]);

  async function deleteMedia(item: MediaItem) {
    if (!window.confirm("¿Eliminar este archivo definitivamente?")) return;
    await apiSend("DELETE", `/api/v1/media/${item.id}`);
    setSelected(null);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className="w-32">
          <option value="">Todo</option>
          <option value="photo">Fotos</option>
          <option value="video">Vídeos</option>
        </Select>
        <Select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} className="w-48">
          <option value="">Todos los trabajadores</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.full_name}</option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
        <Button
          variant="outline"
          className="ml-auto"
          disabled={!data || data.total === 0}
          onClick={() =>
            apiDownload(
              `/api/v1/obras/${obraId}/media/export.zip${kind ? `?kind=${kind}` : ""}`,
              "fotos-obra.zip",
            )
          }
        >
          <Download /> Descargar ZIP
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data && data.items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No hay archivos con estos filtros.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {data?.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className="relative aspect-square overflow-hidden rounded-md bg-muted"
          >
            {item.thumb_url ? (
              <AuthImg
                src={item.thumb_url}
                alt={item.caption ?? item.original_filename}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-2xl">
                {item.kind === "video" ? "🎬" : "📷"}
              </span>
            )}
            {item.kind === "video" ? (
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">
                🎬
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {data && data.pages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {data.page} de {data.pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Siguiente
          </Button>
        </div>
      ) : null}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          {selected ? (
            <>
              <DialogTitle className="pr-8 text-base">
                {selected.caption || selected.original_filename}
              </DialogTitle>
              <Lightbox item={selected} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {selected.user_full_name} · {formatDateTime(selected.uploaded_at)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      apiDownload(selected.file_url, selected.original_filename)
                    }
                  >
                    <Download /> Descargar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteMedia(selected)}>
                    <Trash2 /> Eliminar
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Full-size media viewer: fetches the original through the auth client. */
export function Lightbox({ item }: { item: MediaItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    apiFetch(item.file_url)
      .then((res) => res.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, item.file_url]);

  if (!url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground">
        Cargando...
      </div>
    );
  }
  if (item.kind === "video") {
    return <video src={url} controls autoPlay className="max-h-[70vh] w-full rounded-md bg-black" />;
  }
  return <img src={url} alt={item.caption ?? item.original_filename} className="max-h-[70vh] w-full rounded-md object-contain" />;
}
