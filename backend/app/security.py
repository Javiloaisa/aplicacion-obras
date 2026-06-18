import base64
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TokenType = Literal["access", "refresh"]

# Reversible encryption for the admin "consultar contraseña" feature. The key is
# derived from JWT_SECRET so no extra config is needed; encrypting (rather than
# storing plaintext) keeps the off-site DB backups from leaking credentials.
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.jwt_secret.encode()).digest()))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def encrypt_password(plain: str) -> str:
    """Encrypt a password so an admin can read it back later."""
    return _fernet.encrypt(plain.encode()).decode()


def decrypt_password(token: str | None) -> str | None:
    """Decrypt a stored password, or None if absent/undecryptable (e.g. legacy rows)."""
    if not token:
        return None
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def set_password(user, plain: str, *, must_change: bool) -> None:
    """Set both the bcrypt hash (for login) and the encrypted copy (for admin recovery)."""
    user.password_hash = hash_password(plain)
    user.password_enc = encrypt_password(plain)
    user.must_change_password = must_change


def _create_token(user_id: uuid.UUID, token_type: TokenType, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: uuid.UUID) -> str:
    return _create_token(
        user_id, "access", timedelta(minutes=settings.access_token_expire_minutes)
    )


def create_refresh_token(user_id: uuid.UUID) -> str:
    return _create_token(
        user_id, "refresh", timedelta(days=settings.refresh_token_expire_days)
    )


def decode_token(token: str) -> dict[str, Any] | None:
    """Return the token payload, or None if invalid/expired."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
