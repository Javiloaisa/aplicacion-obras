import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { Button, ErrorMessage, Field, Input, Textarea } from "../components/ui";
import { apiSend } from "../lib/api";
import { enqueue, isRetryable } from "../lib/offline-queue";
import { compressPhoto, uploadMediaFile } from "../lib/upload";
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

interface Photo {
  file: File;
  previewUrl: string;
  isVideo: boolean;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "queued" | "error";
}

export default function Parte() {
  const { obraId } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"times" | "manual">("times");
  const [workDate, setWorkDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // null = editing; otherwise the parte is saved and we show the result
  const [result, setResult] = useState<"sent" | "queued" | "partial" | null>(null);
  // Kept so failed photo uploads can be retried without re-creating the parte
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);

  const preview = mode === "times" ? computedHours(startTime, endTime) : null;

  function pickFiles(files: FileList | null) {
    if (!files) return;
    const picked: Photo[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith("video/"),
      progress: 0,
      status: "pending",
    }));
    setPhotos((prev) => [...prev, ...picked]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updatePhoto(index: number, changes: Partial<Photo>) {
    setPhotos((prev) => prev.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  /**
   * Upload the given photos linked to a work entry. Returns counters so the
   * caller can decide the final state. A connection loss mid-upload sends the
   * file to the offline queue (linked by the real entry id); a permanent
   * rejection (bad format/size) is flagged on the tile.
   */
  async function uploadPhotos(
    entryId: string,
    indices: number[],
  ): Promise<{ queued: number; failed: number }> {
    let queued = 0;
    let failed = 0;
    for (const i of indices) {
      updatePhoto(i, { status: "uploading", progress: 0 });
      const original = photos[i];
      try {
        const file = original.isVideo ? original.file : await compressPhoto(original.file);
        await uploadMediaFile(obraId!, file, null, (pct) => updatePhoto(i, { progress: pct }), entryId);
        updatePhoto(i, { status: "done", progress: 100 });
      } catch (err) {
        if (isRetryable(err)) {
          const file = original.isVideo ? original.file : await compressPhoto(original.file);
          await enqueue({
            kind: "media",
            obraId: obraId!,
            blob: file,
            filename: file.name,
            mimeType: file.type,
            caption: null,
            workEntryId: entryId,
            createdAt: Date.now() + i,
          });
          updatePhoto(i, { status: "queued" });
          queued++;
        } else {
          updatePhoto(i, { status: "error" });
          failed++;
        }
      }
    }
    return { queued, failed };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!obraId) return;
    setError("");
    setBusy(true);
    const body =
      mode === "times"
        ? { work_date: workDate, start_time: startTime, end_time: endTime, notes: notes || null }
        : { work_date: workDate, hours: Number(hours), notes: notes || null };

    // 1) Create the parte (or queue it offline).
    let entryId: string | null = null;
    try {
      const entry = await apiSend<WorkEntry>("POST", `/api/v1/obras/${obraId}/entries`, body);
      entryId = entry.id;
      setSavedEntryId(entry.id);
    } catch (err) {
      if (isRetryable(err)) {
        // Offline: queue the parte and any photos, linked by a client ref so
        // they get attached to it when the parte reaches the server.
        const clientRef = crypto.randomUUID();
        await enqueue({ kind: "entry", obraId, body, clientRef, createdAt: Date.now() });
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          const file = p.isVideo ? p.file : await compressPhoto(p.file);
          await enqueue({
            kind: "media",
            obraId,
            blob: file,
            filename: file.name,
            mimeType: file.type,
            caption: null,
            workEntryRef: clientRef,
            createdAt: Date.now() + 1 + i,
          });
          updatePhoto(i, { status: "queued" });
        }
        setResult("queued");
        setTimeout(() => navigate(`/obras/${obraId}`, { replace: true }), 1400);
        return;
      }
      setError(err instanceof Error ? err.message : "No se pudo guardar el parte");
      setBusy(false);
      return;
    }

    // 2) Parte created: upload attached photos linked to it.
    if (photos.length === 0) {
      setResult("sent");
      setTimeout(() => navigate(`/obras/${obraId}`, { replace: true }), 900);
      return;
    }

    const { queued, failed } = await uploadPhotos(
      entryId,
      photos.map((_, i) => i),
    );
    if (failed > 0) {
      // Parte is saved; let the worker retry the files that the server rejected.
      setResult("partial");
      setBusy(false);
      return;
    }
    setResult(queued > 0 ? "queued" : "sent");
    setTimeout(() => navigate(`/obras/${obraId}`, { replace: true }), 900);
  }

  async function retryFailed() {
    if (!savedEntryId) return;
    setBusy(true);
    const indices = photos.map((p, i) => (p.status === "error" ? i : -1)).filter((i) => i >= 0);
    const { failed } = await uploadPhotos(savedEntryId, indices);
    if (failed === 0) {
      setResult("sent");
      setTimeout(() => navigate(`/obras/${obraId}`, { replace: true }), 900);
    } else {
      setBusy(false);
    }
  }

  if (result === "sent" || result === "queued") {
    return (
      <Layout title="Parte de horas" back={`/obras/${obraId}`}>
        <div className="py-16 text-center">
          <div className="mb-3 text-6xl">{result === "sent" ? "✅" : "⏳"}</div>
          <p className="text-xl font-semibold text-gray-900">
            {result === "sent"
              ? "Parte guardado"
              : "Sin conexión: se enviará automáticamente"}
          </p>
        </div>
      </Layout>
    );
  }

  // result === "partial": parte saved but some files could not be uploaded
  if (result === "partial") {
    return (
      <Layout title="Parte de horas" back={`/obras/${obraId}`}>
        <div className="space-y-4 py-6">
          <div className="text-center">
            <div className="mb-2 text-5xl">⚠️</div>
            <p className="text-lg font-semibold text-gray-900">Parte guardado</p>
            <p className="text-gray-600">
              Algunos archivos no se pudieron subir (formato o tamaño).
            </p>
          </div>
          <PhotoGrid photos={photos} />
          <Button type="button" onClick={retryFailed} disabled={busy}>
            {busy ? "Reintentando..." : "Reintentar archivos"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/obras/${obraId}`, { replace: true })}
            disabled={busy}
          >
            Continuar sin esos archivos
          </Button>
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
              <p className="text-center text-lg font-semibold text-brand-600">
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

        {/* Photos/videos of this specific job, attached to the parte */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            Fotos/vídeos del trabajo (opcional)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => pickFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            📷 {photos.length === 0 ? "Añadir fotos o vídeos" : "Añadir más"}
          </Button>
          {photos.length > 0 ? (
            <PhotoGrid photos={photos} onRemove={busy ? undefined : removePhoto} />
          ) : null}
        </div>

        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" disabled={busy}>
          {busy
            ? photos.length > 0
              ? "Guardando y subiendo..."
              : "Guardando..."
            : "Guardar parte"}
        </Button>
      </form>
    </Layout>
  );
}

function PhotoGrid({
  photos,
  onRemove,
}: {
  photos: Photo[];
  onRemove?: (index: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((item, index) => (
        <div
          key={item.previewUrl}
          className="relative aspect-square overflow-hidden rounded-xl bg-gray-200"
        >
          {item.isVideo ? (
            <video src={item.previewUrl} muted playsInline className="h-full w-full object-cover" />
          ) : (
            <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
          )}
          {item.isVideo ? (
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-xs text-white">
              🎬
            </span>
          ) : null}
          {onRemove && item.status === "pending" ? (
            <button
              type="button"
              onClick={() => onRemove(index)}
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
                  className="h-full bg-brand-400 transition-all"
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
          {item.status === "queued" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-4xl">
              ⏳
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
  );
}
