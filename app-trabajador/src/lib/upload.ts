import { getAccessToken } from "./auth";
import { ApiError } from "./api";
import type { MediaItem } from "./types";

const MAX_PHOTO_SIDE = 2560;
const JPEG_QUALITY = 0.85;

/**
 * Downscale a photo on the client (canvas) before uploading to save data.
 * Returns the original file when it cannot be decoded (e.g. HEIC on some
 * browsers) — the backend validates and accepts it anyway.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

/**
 * Upload one file with progress callback (XMLHttpRequest: fetch has no
 * upload progress events). Resolves with the created media metadata.
 */
export function uploadMediaFile(
  obraId: string,
  file: File,
  caption: string | null,
  onProgress: (percent: number) => void,
  workEntryId?: string | null,
): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("files", file);
    if (caption) form.append("caption", caption);
    if (workEntryId) form.append("work_entry_id", workEntryId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1/obras/${obraId}/media`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const items = JSON.parse(xhr.responseText) as MediaItem[];
        resolve(items[0]);
      } else {
        let detail = `Error ${xhr.status}`;
        try {
          detail = JSON.parse(xhr.responseText).detail ?? detail;
        } catch {
          // Non-JSON error body
        }
        reject(new ApiError(xhr.status, detail));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Sin conexión"));
    xhr.send(form);
  });
}
