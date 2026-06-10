import uuid
from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Obra, ObraAssignment, User
from app.security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="No autenticado",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _credentials_exc

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise _credentials_exc

    try:
        user_id = uuid.UUID(payload.get("sub", ""))
    except ValueError:
        raise _credentials_exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _credentials_exc
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador",
        )
    return user


def get_obra_or_404(db: Session, obra_id: uuid.UUID) -> Obra:
    obra = db.get(Obra, obra_id)
    if obra is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Obra no encontrada"
        )
    return obra


def ensure_obra_access(db: Session, obra: Obra, user: User) -> None:
    """Admins access any obra; workers only active obras they are assigned to."""
    if user.role == "admin":
        return
    assignment = db.get(ObraAssignment, (obra.id, user.id))
    if assignment is None or obra.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No estás asignado a esta obra",
        )
