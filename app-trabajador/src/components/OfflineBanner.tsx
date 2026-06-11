import { useEffect, useState } from "react";
import { flushQueue, onQueueChange, pendingCount } from "../lib/offline-queue";

/** Visible banner with the number of queued items waiting to be sent. */
export default function OfflineBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    void pendingCount().then(setCount);
    return onQueueChange(setCount);
  }, []);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => void flushQueue()}
      className="block w-full bg-brand-100 px-4 py-2 text-center text-base font-medium text-brand-900"
    >
      ⏳ {count} {count === 1 ? "elemento pendiente" : "elementos pendientes"} de
      enviar — toca para reintentar
    </button>
  );
}
