import uuid

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
