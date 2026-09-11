import uuid

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Empresa, MediaFile, User, WorkEntry


class EmpresaNotFoundError(Exception):
    """Raised when a slug does not match any row in `empresas`."""


def get_empresa_by_slug(db: Session, slug: str) -> Empresa:
    empresa = db.scalar(select(Empresa).where(Empresa.slug == slug))
    if empresa is None:
        raise EmpresaNotFoundError(slug)
    return empresa


def assign_user_empresa(
    db: Session,
    user: User,
    *,
    empresa_id: uuid.UUID | None,
    acceso_todas_empresas: bool = False,
) -> None:
    """Set a user's company scope and carry over their pending records.

    Work entries and media files the user owns with `empresa_id IS NULL`
    move to the same empresa in this same call, so pending data does not
    linger orphaned once the user is classified. Records already assigned to
    an empresa (their own or the other one) are left untouched — reassigning
    a user never moves data away from where it already belongs.

    No inheritance happens when `empresa_id` is None (an admin being granted
    `acceso_todas_empresas`): there is no single target empresa to move
    pending records into, so they stay pending.
    """
    user.empresa_id = empresa_id
    user.acceso_todas_empresas = acceso_todas_empresas
    db.add(user)

    if empresa_id is not None:
        db.execute(
            update(WorkEntry)
            .where(WorkEntry.user_id == user.id, WorkEntry.empresa_id.is_(None))
            .values(empresa_id=empresa_id)
        )
        db.execute(
            update(MediaFile)
            .where(MediaFile.user_id == user.id, MediaFile.empresa_id.is_(None))
            .values(empresa_id=empresa_id)
        )


def resolve_upload_empresa(
    db: Session,
    user: User,
    empresa_param: str | None,
    work_entry: WorkEntry | None,
) -> uuid.UUID | None:
    """Decide which empresa a newly uploaded media file belongs to.

    - Linked to a parte: inherits that parte's empresa (already validated
      against the obra when the parte was created), overriding everything else.
    - Worker, or admin scoped to a single empresa: their own empresa_id
      (None if the worker is still pending classification).
    - Admin with access to both companies: the empresa they picked in the
      header selector for this upload; required, since there is no
      "unassigned" option for new media.
    """
    if work_entry is not None:
        return work_entry.empresa_id
    if user.role == "admin" and user.acceso_todas_empresas:
        if empresa_param is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Indica para qué empresa subes este archivo",
            )
        return get_empresa_by_slug(db, empresa_param).id
    return user.empresa_id
