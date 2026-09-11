import { useEffect, useState } from "react";
import {
  dismissAllFailed,
  failedItems,
  flushQueue,
  onQueueChange,
  pendingCount,
  type QueuedItem,
} from "../lib/offline-queue";

/** Visible banners: items still queued to send, and items the server permanently rejected. */
export default function OfflineBanner() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<QueuedItem[]>([]);

  useEffect(() => {
    void pendingCount().then(setPending);
    void failedItems().then(setFailed);
    return onQueueChange((state) => {
      setPending(state.pending);
      if (state.failed === 0) setFailed([]);
      else void failedItems().then(setFailed);
    });
  }, []);

  return (
    <>
      {pending > 0 ? (
        <button
          type="button"
          onClick={() => void flushQueue()}
          className="block w-full bg-brand-100 px-4 py-2 text-center text-base font-medium text-brand-900"
        >
          ⏳ {pending} {pending === 1 ? "elemento pendiente" : "elementos pendientes"} de
          enviar — toca para reintentar
        </button>
      ) : null}
      {failed.length > 0 ? (
        <div className="flex items-center justify-between gap-3 bg-red-100 px-4 py-2 text-sm text-red-900">
          <span>
            ⚠️ {failed.length}{" "}
            {failed.length === 1 ? "elemento no se pudo enviar" : "elementos no se pudieron enviar"}
            {failed[0]?.failReason ? ` (${failed[0].failReason})` : ""}
          </span>
          <button
            type="button"
            onClick={() => void dismissAllFailed()}
            className="shrink-0 whitespace-nowrap font-medium underline"
          >
            Descartar
          </button>
        </div>
      ) : null}
    </>
  );
}
