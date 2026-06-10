import uuid as uuid_mod
from pathlib import Path

from fastapi import UploadFile

from app.config import settings

CHUNK_SIZE = 1024 * 1024

# ISO BMFF brands that identify HEIC/HEIF still images (vs MP4/MOV video)
_HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"heif"}


class UploadValidationError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def sniff(header: bytes) -> tuple[str, str, str] | None:
    """Detect (kind, extension, mime) from magic bytes, or None if unsupported."""
    if header.startswith(b"\xff\xd8\xff"):
        return ("photo", "jpg", "image/jpeg")
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ("photo", "png", "image/png")
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return ("photo", "webp", "image/webp")
    if header[:4] == b"\x1a\x45\xdf\xa3":  # EBML (WebM/Matroska)
        return ("video", "webm", "video/webm")
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12]
        if brand in _HEIC_BRANDS:
            return ("photo", "heic", "image/heic")
        if brand == b"qt  ":
            return ("video", "mov", "video/quicktime")
        return ("video", "mp4", "video/mp4")
    return None


def media_abs_path(rel_path: str) -> Path:
    return Path(settings.media_root) / rel_path


def save_media_file(obra_id: uuid_mod.UUID, upload: UploadFile) -> dict:
    """Validate magic bytes + size while streaming to disk.

    Returns dict with id, kind, mime, ext, size and rel_path.
    Raises UploadValidationError on unsupported type or oversized file.
    """
    header = upload.file.read(32)
    info = sniff(header)
    if info is None:
        raise UploadValidationError(
            f"Tipo de archivo no permitido: {upload.filename or 'archivo'}"
        )
    kind, ext, mime = info
    limit_mb = settings.max_photo_mb if kind == "photo" else settings.max_video_mb
    limit = limit_mb * 1024 * 1024

    file_id = uuid_mod.uuid4()
    rel_path = f"{obra_id}/{file_id}.{ext}"
    abs_path = media_abs_path(rel_path)
    abs_path.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    with open(abs_path, "wb") as out:
        out.write(header)
        size += len(header)
        while chunk := upload.file.read(CHUNK_SIZE):
            size += len(chunk)
            if size > limit:
                break
            out.write(chunk)

    if size > limit:
        abs_path.unlink(missing_ok=True)
        raise UploadValidationError(
            f"{upload.filename or 'El archivo'} supera el máximo de {limit_mb} MB"
        )

    return {
        "id": file_id,
        "kind": kind,
        "ext": ext,
        "mime": mime,
        "size": size,
        "rel_path": rel_path,
    }


def delete_media_files(storage_path: str, thumbnail_path: str | None) -> None:
    """Best-effort removal of a media file and its thumbnail from disk."""
    media_abs_path(storage_path).unlink(missing_ok=True)
    if thumbnail_path:
        media_abs_path(thumbnail_path).unlink(missing_ok=True)
