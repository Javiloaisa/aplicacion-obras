import uuid
from typing import Generator, Literal

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Select, and_, or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Empresa, Obra, User
from app.security import decode_token
from app.services.empresas import get_empresa_by_slug

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


class EmpresaScope:
    """Resolved company scope for the current request.

    `empresa_ids is None` means "unrestricted": every empresa, including
    unassigned records, is visible (an admin with `acceso_todas_empresas` and
    no `empresa` query param, or a worker still pending classification).
    Otherwise `empresa_ids` holds the one empresa the caller is scoped to;
    records with `empresa_id IS NULL` ("pending") are always included
    alongside it, per the transition rules.
    """

    def __init__(self, user: User, empresa_ids: list[uuid.UUID] | None):
        self.user = user
        self.empresa_ids = empresa_ids

    @property
    def unrestricted(self) -> bool:
        return self.empresa_ids is None

    def allows_empresa_id(self, empresa_id: uuid.UUID | None) -> bool:
        """Whether a row with this direct empresa_id (or None) is in scope."""
        if self.unrestricted or empresa_id is None:
            return True
        return empresa_id in self.empresa_ids

    def condition_for(self, column):
        """WHERE fragment for a direct nullable empresa_id column, or None if unrestricted."""
        if self.unrestricted:
            return None
        return or_(column.in_(self.empresa_ids), column.is_(None))

    def apply(self, stmt: Select, column) -> Select:
        """Filter a select() on a direct nullable empresa_id column."""
        condition = self.condition_for(column)
        return stmt if condition is None else stmt.where(condition)

    def allows_user(self, target: User) -> bool:
        """Like allows_empresa_id, but for a *user* row specifically.

        An admin with acceso_todas_empresas also has empresa_id IS NULL, same
        as a pending worker — but it means the opposite thing (access to
        everything, not access to nothing). Such an account must only be
        manageable by another admin whose own scope is unrestricted, never
        leaked into a single-empresa admin's user list or edit/delete access.
        """
        if target.role == "admin" and target.acceso_todas_empresas:
            return self.unrestricted
        return self.allows_empresa_id(target.empresa_id)

    def filter_users(self, stmt: Select) -> Select:
        """Filter a select() that has User in its FROM, per allows_user's rule."""
        if self.unrestricted:
            return stmt
        return stmt.where(
            or_(
                User.empresa_id.in_(self.empresa_ids),
                and_(User.empresa_id.is_(None), User.acceso_todas_empresas.is_(False)),
            )
        )

    def allows_obra(self, obra: Obra) -> bool:
        """Whether an obra (via its obra_empresas rows) is in scope."""
        if self.unrestricted:
            return True
        assigned = {e.id for e in obra.empresas}
        if not assigned:
            return True  # unassigned obra: visible to everyone in scope
        return bool(assigned & set(self.empresa_ids))

    def filter_obras(self, stmt: Select) -> Select:
        """Filter a select() that has Obra in its FROM (own empresa(s) or unassigned)."""
        if self.unrestricted:
            return stmt
        return stmt.where(
            or_(~Obra.empresas.any(), Obra.empresas.any(Empresa.id.in_(self.empresa_ids)))
        )


def scope_empresa(
    empresa: Literal["nido", "fega"] | None = Query(
        None, description="Solo aplica a un admin con acceso a ambas empresas"
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmpresaScope:
    if user.role == "admin" and user.acceso_todas_empresas:
        if empresa is None:
            return EmpresaScope(user, None)
        chosen = get_empresa_by_slug(db, empresa)
        return EmpresaScope(user, [chosen.id])
    if user.empresa_id is not None:
        # Ignores the query param entirely: scoped users always see their own.
        return EmpresaScope(user, [user.empresa_id])
    # Worker (or, in principle, an admin, though the admin_scope_obligatorio
    # constraint never leaves one here) with empresa_id NULL: transition, no filter.
    return EmpresaScope(user, None)


def get_obra_or_404(db: Session, obra_id: uuid.UUID) -> Obra:
    obra = db.get(Obra, obra_id)
    if obra is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Obra no encontrada"
        )
    return obra


def ensure_obra_access(db: Session, obra: Obra, user: User, scope: EmpresaScope) -> None:
    """Admins access any obra in scope; workers any *active* obra in scope.

    A company mismatch 404s rather than 403s, so a request never reveals
    that an out-of-scope obra exists.
    """
    if user.role != "admin" and obra.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La obra no está activa",
        )
    if not scope.allows_obra(obra):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Obra no encontrada"
        )


def ensure_obra_matches_empresa(obra: Obra, empresa_id: uuid.UUID | None) -> None:
    """404 unless the obra is unassigned or assigned to this empresa.

    Used when filing a parte/media into an obra on behalf of a specific
    worker: an obra visible under the requester's scope (e.g. an admin with
    access to both companies) may still not be one the *target* worker's
    company is allowed to work in. A pending worker (empresa_id None) is
    never restricted here — the transition rule lets them work anywhere.
    """
    if empresa_id is None:
        return
    assigned = {e.id for e in obra.empresas}
    if assigned and empresa_id not in assigned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Obra no encontrada"
        )
