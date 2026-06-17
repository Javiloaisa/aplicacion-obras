import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import AuthImg from "@/components/AuthImg";
import { Lightbox } from "@/components/obra/GaleriaTab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiDownload, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MediaItem, MediaList } from "@/lib/types";

export default function EntryMediaDialog({
  obraId,
  entryId,
  open,
  onClose,
}: {
  obraId: string;
  entryId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setError("");
    apiFetch(`/api/v1/obras/${obraId}/media?work_entry_id=${entryId}`)
      .then((res) => res.json())
      .then((data: MediaList) => setItems(data.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar las fotos"),
      );
  }, [open, obraId, entryId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelected(null);
          onClose();
        }
      }}
    >
      <DialogContent className={selected ? "max-w-3xl" : undefined}>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => apiDownload(selected.file_url, selected.original_filename)}
              >
                <Download /> Descargar
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              ← Volver a las fotos
            </Button>
          </>
        ) : (
          <>
            <DialogTitle>Fotos y vídeos del parte</DialogTitle>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {!error && items === null ? (
              <p className="py-8 text-center text-muted-foreground">Cargando...</p>
            ) : null}
            {items && items.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No hay fotos ni vídeos para este parte.
              </p>
            ) : null}
            {items && items.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {items.map((item) => (
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
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
