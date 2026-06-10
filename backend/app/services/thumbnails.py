import logging
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image

from app import database
from app.models import MediaFile
from app.services.storage import media_abs_path

logger = logging.getLogger(__name__)

THUMB_MAX_SIZE = 480
_LOCAL_TZ = ZoneInfo("Europe/Madrid")

try:  # HEIC support (iPhone photos)
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:  # pragma: no cover
    logger.warning("pillow-heif not installed, HEIC thumbnails disabled")


def generate_thumbnail(media_id: uuid.UUID) -> None:
    """Background task: create the thumbnail and fill EXIF/duration metadata."""
    with database.SessionLocal() as db:
        media = db.get(MediaFile, media_id)
        if media is None:
            return
        src = media_abs_path(media.storage_path)
        thumb_rel = f"{media.obra_id}/{src.stem}_thumb.jpg"
        thumb_abs = media_abs_path(thumb_rel)
        try:
            if media.kind == "photo":
                _photo_thumbnail(src, thumb_abs)
                media.taken_at = _exif_taken_at(src)
            else:
                _video_thumbnail(src, thumb_abs)
                media.duration_seconds = _video_duration(src)
            media.thumbnail_path = thumb_rel
            db.add(media)
            db.commit()
        except Exception as exc:  # noqa: BLE001 — thumbnails are best-effort
            logger.warning("Thumbnail generation failed for %s: %s", media_id, exc)


def _photo_thumbnail(src: Path, dest: Path) -> None:
    with Image.open(src) as img:
        img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE))
        img.convert("RGB").save(dest, "JPEG", quality=80)


def _exif_taken_at(src: Path) -> datetime | None:
    try:
        with Image.open(src) as img:
            exif = img.getexif()
            raw = exif.get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
        if not raw:
            return None
        local = datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
        return local.replace(tzinfo=_LOCAL_TZ)
    except Exception:  # noqa: BLE001
        return None


def _video_thumbnail(src: Path, dest: Path) -> None:
    for seek in ("1", "0"):  # fall back to first frame on very short clips
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-ss", seek, "-i", str(src),
                "-frames:v", "1", "-vf", f"scale={THUMB_MAX_SIZE}:-2", str(dest),
            ],
            capture_output=True,
            timeout=60,
        )
        if result.returncode == 0 and dest.exists():
            return
    raise RuntimeError("ffmpeg could not extract a frame")


def _video_duration(src: Path) -> int | None:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(src),
            ],
            capture_output=True,
            timeout=30,
        )
        return round(float(result.stdout.strip()))
    except Exception:  # noqa: BLE001
        return None
