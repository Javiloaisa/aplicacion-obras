from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import User
from app.schemas.user import MeEmpresaBody, UserOut
from app.services.empresas import (
    assign_user_empresa,
    count_admins_with_access,
    get_empresa_by_slug,
)

router = APIRouter(prefix="/me", tags=["me"])


@router.post("/empresa", response_model=UserOut)
def set_my_empresa(
    body: MeEmpresaBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-service downgrade: an admin with access to both companies drops
    to just one. Never grants access — only an existing admin of both (via
    the panel) or the recovery script can do that."""
    if user.role != "admin" or not user.acceso_todas_empresas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo un administrador con acceso a ambas empresas puede hacer esto",
        )

    keep = get_empresa_by_slug(db, body.empresa)
    dropped_slug = "fega" if body.empresa == "nido" else "nido"
    dropped = get_empresa_by_slug(db, dropped_slug)

    if count_admins_with_access(db, dropped.id, exclude_user_id=user.id) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Eres el único administrador con acceso a {dropped.nombre}. "
                "Da acceso a otro administrador antes de quitarte el tuyo."
            ),
        )

    assign_user_empresa(db, user, empresa_id=keep.id, acceso_todas_empresas=False)
    db.commit()
    db.refresh(user)
    return user
