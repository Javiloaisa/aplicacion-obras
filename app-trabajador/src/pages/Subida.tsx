import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { Button, ErrorMessage, Field, Input } from "../components/ui";
import { compressPhoto, uploadMediaFile } from "../lib/upload";

interface PendingFile {
  file: File;
  previewUrl: string;
  isVideo: boolean;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function Subida() {
  const { obraId } = useParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PendingFile[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith("video/"),
      progress: 0,
      status: "pending" as const,
    }));
    setItems((prev) => [...prev, ...picked]);
    // Allow picking the same file again later
    if (inputRef.current) inputRef.current.value = "";
  }

  function updateItem(index: number, changes: Partial<PendingFile>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function uploadAll() {
    if (!obraId) return;
    setError("");
    setBusy(true);
    // Sequential uploads: predictable on poor mobile connections
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "done") continue;
      updateItem(i, { status: "uploading", progress: 0, error: undefined });
      try {
        const file = items[i].isVideo
          ? items[i].file
          : await compressPhoto(items[i].file);
        await uploadMediaFile(obraId, file, caption || null, (percent) =>
          updateItem(i, { progress: percent }),
        );
        updateItem(i, { status: "done", progress: 100 });
      } catch (err) {
        updateItem(i, {
          status: "error",
          error: err instanceof Error ? err.message : "Error al subir",
        });
      }
    }
    setBusy(false);
  }

  const allDone = items.length > 0 && items.every((i) => i.status === "done");
  const failures = items.filter((i) => i.status === "error").length;

  return (
    <Layout title="Subir fotos/vídeos" back={`/obras/${obraId}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => pickFiles(e.target.files)}
      />

      <div className="space-y-4">
        <Button
          type="button"
          variant={items.length === 0 ? "primary" : "secondary"}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          📷 {items.length === 0 ? "Hacer foto o elegir archivos" : "Añadir más"}
        </Button>

        {items.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {items.map((item, index) => (
                <div
                  key={item.previewUrl}
                  className="relative aspect-square overflow-hidden rounded-xl bg-gray-200"
                >
                  {item.isVideo ? (
                    <video
                      src={item.previewUrl}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                  {item.isVideo ? (
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-xs text-white">
                      🎬
                    </span>
                  ) : null}
                  {item.status === "pending" && !busy ? (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      aria-label="Quitar"
                      className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      ✕
                    </button>
                  ) : null}
                  {item.status === "uploading" ? (
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1">
                      <div className="h-2 overflow-hidden rounded-full bg-gray-500">
                        <div
                          className="h-full bg-amber-400 transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {item.status === "done" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-4xl">
                      ✅
                    </div>
                  ) : null}
                  {item.status === "error" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-600/60 text-4xl">
                      ⚠️
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {!allDone ? (
              <Field label="Comentario (opcional, para todos los archivos)">
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={500}
                  placeholder="Ej.: tabiquería planta 2"
                  disabled={busy}
                />
              </Field>
            ) : null}

            <ErrorMessage>{error}</ErrorMessage>
            {failures > 0 && !busy ? (
              <ErrorMessage>
                {failures} {failures === 1 ? "archivo ha fallado" : "archivos han fallado"}.
                Pulsa subir para reintentar.
              </ErrorMessage>
            ) : null}

            {allDone ? (
              <div className="py-4 text-center">
                <p className="text-xl font-semibold text-gray-900">
                  ✅ Todo subido ({items.length})
                </p>
              </div>
            ) : (
              <Button type="button" onClick={uploadAll} disabled={busy}>
                {busy
                  ? "Subiendo..."
                  : `Subir ${items.length} ${items.length === 1 ? "archivo" : "archivos"}`}
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Layout>
  );
}
