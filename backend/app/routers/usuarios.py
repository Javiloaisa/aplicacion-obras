import secrets
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.models import MediaFile, User, WorkEntry
from app.schemas.user import (
    PasswordReveal,
    UserCreate,
    UserOut,
    UserUpdate,
    UserWithTempPassword,
)
from app.security import decrypt_password, set_password

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

# No ambiguous characters (0/O, 1/l/I) so credentials can be dictated by phone
_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _temp_password(length: int = 10) -> str:
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


@router.get("", response_model=list[UserOut])
def list_usuarios(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.scalars(select(User).order_by(User.full_name)).all()


@router.post(
    "", response_model=UserWithTempPassword, status_code=status.HTTP_201_CREATED
)
def create_usuario(
    body: UserCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    username = body.username.lower()
    if db.scalar(select(User).where(User.username == username)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese nombre",
        )

    temp_password = _temp_password()
    user = User(
        username=username,
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        trade=body.trade,
        role=body.role,
    )
    set_password(user, temp_password, must_change=True)
    db.add(user)
    db.commit()

    out = UserWithTempPassword.model_validate(user)
    out.temp_password = temp_password
    return out


@router.patch("/{user_id}", response_model=UserWithTempPassword)
def update_usuario(
    user_id: uuid.UUID,
    body: UserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
        )

    data = body.model_dump(exclude_unset=True)
    reset_password = data.pop("reset_password", False)
    new_password = data.pop("new_password", None)

    # Guard against locking yourself out of the panel
    if user.id == admin.id and (
        data.get("is_active") is False or data.get("role") == "worker"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar ni degradar tu propia cuenta",
        )

    for field, value in data.items():
        setattr(user, field, value)

    temp_password = None
    if new_password:
        set_password(user, new_password, must_change=False)
    elif reset_password:
        temp_password = _temp_password()
        set_password(user, temp_password, must_change=True)

    db.add(user)
    db.commit()

    out = UserWithTempPassword.model_validate(user)
    out.temp_password = temp_password
    return out


@router.get("/{user_id}/password", response_model=PasswordReveal)
def reveal_password(
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return a worker's current password so the admin can remind them of it.

    Only accounts whose password was set after this feature shipped have a
    recoverable copy; older ones return null and must be reset instead.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
        )
    return PasswordReveal(password=decrypt_password(user.password_enc))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_usuario(
    user_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
        )
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propia cuenta",
        )

    has_entries = (
        db.scalar(select(WorkEntry.id).where(WorkEntry.user_id == user.id).limit(1))
        is not None
    )
    has_media = (
        db.scalar(select(MediaFile.id).where(MediaFile.user_id == user.id).limit(1))
        is not None
    )
    if has_entries or has_media:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: tiene horas o material registrado. Desactívalo en su lugar.",
        )

    db.delete(user)
    db.commit()
