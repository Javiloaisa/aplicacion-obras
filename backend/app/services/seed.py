import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User
from app.security import hash_password

logger = logging.getLogger(__name__)


def seed_admin(db: Session) -> None:
    """Create the initial admin account from .env if it does not exist."""
    username = settings.admin_username.lower()
    existing = db.scalar(select(User).where(User.username == username))
    if existing is not None:
        return

    admin = User(
        username=username,
        full_name="Administrador",
        password_hash=hash_password(settings.admin_password),
        role="admin",
        is_active=True,
        must_change_password=True,
    )
    db.add(admin)
    db.commit()
    logger.info("Seeded initial admin user '%s'", username)
