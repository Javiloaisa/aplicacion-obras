import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { apiSend, ApiError, SessionExpiredError } from "./api";
import { uploadMediaFile } from "./upload";

// Offline queue: failed work entries and media uploads are stored in
// IndexedDB and retried when the connection comes back or the app opens.

export interface QueuedEntry {
  id?: number;
  kind: "entry";
  obraId: string;
  body: Record<string, unknown>;
  // Client-side ref so media queued alongside this parte can be linked to it
  // once the server assigns the real work entry id (see flushQueue).
  clientRef?: string;
  createdAt: number;
}

export interface QueuedMedia {
  id?: number;
  kind: "media";
  obraId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  caption: string | null;
  // Link to a parte: either a known server id, or the clientRef of a queued
  // entry that hasn't been sent yet (resolved during flushQueue).
  workEntryId?: string | null;
  workEntryRef?: string;
  createdAt: number;
}

export type QueuedItem = QueuedEntry | QueuedMedia;

interface QueueDB extends DBSchema {
  queue: { key: number; value: QueuedItem };
}

const QUEUE_CHANGED = "pdo-queue-changed";
let dbPromise: Promise<IDBPDatabase<QueueDB>> | null = null;

function getDB(): Promise<IDBPDatabase<QueueDB>> {
  if (!dbPromise) {
    dbPromise = openDB<QueueDB>("pdo-offline", 1, {
      upgrade(db) {
        db.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

async function notifyChange(): Promise<void> {
  const count = await pendingCount();
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED, { detail: count }));
}

export async function pendingCount(): Promise<number> {
  return (await getDB()).count("queue");
}

export function onQueueChange(listener: (count: number) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<number>).detail);
  window.addEventListener(QUEUE_CHANGED, handler);
  return () => window.removeEventListener(QUEUE_CHANGED, handler);
}

export async function enqueue(item: QueuedItem): Promise<void> {
  await (await getDB()).add("queue", item);
  await notifyChange();
}

/** True for failures worth retrying later (network down, server hiccup). */
export function isRetryable(err: unknown): boolean {
  if (err instanceof SessionExpiredError) return false;
  if (err instanceof ApiError) return err.status === 0 || err.status >= 500;
  // fetch throws TypeError when offline
  return err instanceof TypeError;
}

let flushing = false;

/**
 * Try to send everything in the queue, oldest first. Stops at the first
 * retryable failure (still offline); drops items the server rejects
 * permanently (4xx) so the queue cannot jam.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const db = await getDB();
    const items = await db.getAll("queue");
    items.sort((a, b) => a.createdAt - b.createdAt);

    // clientRef -> real work entry id, for media queued before its parte existed.
    // Entries are always enqueued before their media, so by the time we reach
    // the media its ref is already resolved (oldest-first order above).
    const refMap = new Map<string, string>();

    for (const item of items) {
      try {
        if (item.kind === "entry") {
          const created = await apiSend<{ id: string }>(
            "POST",
            `/api/v1/obras/${item.obraId}/entries`,
            item.body,
          );
          if (item.clientRef && created?.id) refMap.set(item.clientRef, created.id);
        } else {
          const file = new File([item.blob], item.filename, { type: item.mimeType });
          const workEntryId =
            item.workEntryId ??
            (item.workEntryRef ? refMap.get(item.workEntryRef) ?? null : null);
          await uploadMediaFile(item.obraId, file, item.caption, () => {}, workEntryId);
        }
        await db.delete("queue", item.id!);
        await notifyChange();
      } catch (err) {
        if (isRetryable(err)) return; // still offline: keep the rest queued
        // Permanent rejection (validation, permissions): drop it
        await db.delete("queue", item.id!);
        await notifyChange();
      }
    }
  } finally {
    flushing = false;
  }
}

/** Wire automatic retries: on app start and when the connection returns. */
export function initOfflineQueue(): void {
  window.addEventListener("online", () => void flushQueue());
  void flushQueue();
  void notifyChange();
}
