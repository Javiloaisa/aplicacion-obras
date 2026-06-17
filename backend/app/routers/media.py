import math
import os
import tempfile
import uuid
import zipfile
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.deps import (
    ensure_obra_access,
    get_current_user,
    get_db,
    get_obra_or_404,
    require_admin,
)
from app.models import MediaFile, Obra, User, WorkEntry
from app.schemas.media import MediaListOut, MediaOut, MediaUpdate
from app.services import storage
from app.services.thumbnails import generate_thumbnail
from app.utils import ensure_utc

router = APIRouter(tags=["media"])

DELETE_WINDOW = timedelta(hours=48)


def _media_out(media: MediaFile, user_full_name: str | None = None) -> MediaOut:
    return MediaOut(
        id=media.id,
        obra_id=media.obra_id,
        user_id=media.user_id,
        user_full_name=user_full_name,
        work_entry_id=media.work_entry_id,
        kind=media.kind,
        original_filename=media.original_filename,
        mime_type=media.mime_type,
        size_bytes=media.size_bytes,
        duration_seconds=media.duration_seconds,
        taken_at=media.taken_at,
        uploaded_at=media.uploaded_at,
        caption=media.caption,
        file_url=f"/api/v1/media/{media.id}/file",
        thumb_url=f"/api/v1/media/{media.id}/thumb" if media.thumbnail_path else None,
    )


def _get_media_or_404(db: Session, media_id: uuid.UUID) -> MediaFile:
    media = db.get(MediaFile, media_id)
    if media is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado"
        )
    return media


def _ensure_media_access(db: Session, media: MediaFile, user: User) -> None:
    obra = get_obra_or_404(db, media.obra_id)
    ensure_obra_access(db, obra, user)


@router.post(
    "/obras/{obra_id}/media",
    response_model=list[MediaOut],
    status_code=status.HTTP_201_CREATED,
)
def upload_media(
    obra_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    caption: str | None = Form(None),
    work_entry_id: uuid.UUID | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, user)

    if work_entry_id is not None:
        entry = db.get(WorkEntry, work_entry_id)
        if entry is None or entry.obra_id != obra.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El parte indicado no existe en esta obra",
            )

    saved: list[dict] = []
    media_rows: list[MediaFile] = []
    try:
        for upload in files:
            meta = storage.save_media_file(obra.id, upload)
            saved.append(meta)
            media_rows.append(
                MediaFile(
                    id=meta["id"],
                    obra_id=obra.id,
                    user_id=user.id,
                    work_entry_id=work_entry_id,
                    kind=meta["kind"],
                    original_filename=upload.filename or f"{meta['id']}.{meta['ext']}",
                    storage_path=meta["rel_path"],
                    mime_type=meta["mime"],
                    size_bytes=meta["size"],
                    caption=caption,
                )
            )
    except storage.UploadValidationError as exc:
        # Atomic per request: remove anything already written to disk
        for meta in saved:
            storage.delete_media_files(meta["rel_path"], None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.detail
        )

    db.add_all(media_rows)
    db.commit()

    for media in media_rows:
        background_tasks.add_task(generate_thumbnail, media.id)

    return [_media_out(m, user.full_name) for m in media_rows]


@router.get("/obras/{obra_id}/media", response_model=MediaListOut)
def list_obra_media(
    obra_id: uuid.UUID,
    kind: Literal["photo", "video"] | None = None,
    user_id: uuid.UUID | None = None,
    work_entry_id: uuid.UUID | None = None,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obra = get_obra_or_404(db, obra_id)
    ensure_obra_access(db, obra, user)

    filters = [MediaFile.obra_id == obra.id]
    if kind is not None:
        filters.append(MediaFile.kind == kind)
    if user_id is not None:
        filters.append(MediaFile.user_id == user_id)
    if work_entry_id is not None:
        filters.append(MediaFile.work_entry_id == work_entry_id)
    if from_date is not None:
        filters.append(
            MediaFile.uploaded_at
            >= datetime.combine(from_date, time.min, tzinfo=timezone.utc)
        )
    if to_date is not None:
        filters.append(
            MediaFile.uploaded_at
            < datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        )

    total = db.scalar(select(func.count()).select_from(MediaFile).where(*filters))
    rows = db.execute(
        select(MediaFile, User.full_name)
        .join(User, User.id == MediaFile.user_id)
        .where(*filters)
        .order_by(MediaFile.uploaded_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return MediaListOut(
        items=[_media_out(m, name) for m, name in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/media/recent", response_model=list[MediaOut])
def recent_media(
    limit: int = Query(12, ge=1, le=50),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Latest uploads across all obras, for the admin dashboard."""
    rows = db.execute(
        select(MediaFile, User.full_name, Obra.name)
        .join(User, User.id == MediaFile.user_id)
        .join(Obra, Obra.id == MediaFile.obra_id)
        .order_by(MediaFile.uploaded_at.desc())
        .limit(limit)
    ).all()
    items = []
    for media, full_name, obra_name in rows:
        out = _media_out(media, full_name)
        out.obra_name = obra_name
        items.append(out)
    return items


def _safe_filename(name: str) -> str:
    keep = "-_.() "
    cleaned = "".join(c for c in name if c.isalnum() or c in keep).strip()
    return cleaned or "descarga"


def _unique_arcname(filename: str, used: set[str]) -> str:
    base = _safe_filename(filename)
    name = base
    i = 1
    while name in used:
        stem, dot, ext = base.rpartition(".")
        name = f"{stem} ({i}).{ext}" if dot else f"{base} ({i})"
        i += 1
    used.add(name)
    return name


@router.get("/obras/{obra_id}/media/export.zip")
def export_obra_media_zip(
    obra_id: uuid.UUID,
    kind: Literal["photo", "video"] | None = None,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Download every media file of an obra as a ZIP (admin)."""
    obra = get_obra_or_404(db, obra_id)
    filters = [MediaFile.obra_id == obra.id]
    if kind is not None:
        filters.append(MediaFile.kind == kind)
    medias = db.scalars(
        select(MediaFile).where(*filters).order_by(MediaFile.uploaded_at)
    ).all()
    if not medias:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay archivos para descargar en esta obra",
        )

    tmp = tempfile.NamedTemporaryFile(prefix="obra-media-", suffix=".zip", delete=False)
    tmp.close()
    used: set[str] = set()
    # ZIP_STORED: photos/videos are already compressed, so skip recompression
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_STORED) as zf:
        for media in medias:
            src = storage.media_abs_path(media.storage_path)
            if src.is_file():
                zf.write(src, _unique_arcname(media.original_filename, used))

    filename = f"{_safe_filename(obra.name)}.zip"
    return FileResponse(
        tmp.name,
        media_type="application/zip",
        filename=filename,
        background=BackgroundTask(os.unlink, tmp.name),
    )


@router.get("/media/{media_id}/file")
def download_media(
    media_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    media = _get_media_or_404(db, media_id)
    _ensure_media_access(db, media, user)
    path = storage.media_abs_path(media.storage_path)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo no disponible en el servidor",
        )
    # FileResponse handles HTTP Range requests (video streaming/seek)
    return FileResponse(
        path, media_type=media.mime_type, filename=media.original_filename
    )


@router.get("/media/{media_id}/thumb")
def download_thumbnail(
    media_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    media = _get_media_or_404(db, media_id)
    _ensure_media_access(db, media, user)
    if not media.thumbnail_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Miniatura no disponible"
        )
    path = storage.media_abs_path(media.thumbnail_path)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Miniatura no disponible"
        )
    return FileResponse(path, media_type="image/jpeg")


@router.patch("/media/{media_id}", response_model=MediaOut)
def update_media(
    media_id: uuid.UUID,
    body: MediaUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    media = _get_media_or_404(db, media_id)
    if user.role != "admin" and media.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el autor o un administrador pueden editar este archivo",
        )
    media.caption = body.caption
    db.add(media)
    db.commit()
    return _media_out(media, user.full_name)


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(
    media_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    media = _get_media_or_404(db, media_id)
    if user.role != "admin":
        if media.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el autor o un administrador pueden eliminar este archivo",
            )
        age = datetime.now(timezone.utc) - ensure_utc(media.uploaded_at)
        if age > DELETE_WINDOW:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo puedes eliminar un archivo durante las 48 horas siguientes",
            )

    storage_path, thumbnail_path = media.storage_path, media.thumbnail_path
    db.delete(media)
    db.commit()
    storage.delete_media_files(storage_path, thumbnail_path)
