from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root (../../ from this file) so the shared .env at the monorepo
# root is picked up when running uvicorn locally from backend/.
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg2://partes:partes@localhost:5432/partes_obra"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    admin_username: str = "admin"
    admin_password: str = "admin1234"

    domain: str | None = None
    media_root: str = "/data/media"
    max_photo_mb: int = 15
    max_video_mb: int = 200

    rate_limit_enabled: bool = True

    @property
    def cors_origins(self) -> list[str]:
        origins = ["http://localhost:5173", "http://localhost:5174"]
        if self.domain and self.domain != "example.com":
            origins += [
                f"https://app.{self.domain}",
                f"https://admin.{self.domain}",
            ]
        return origins


settings = Settings()
