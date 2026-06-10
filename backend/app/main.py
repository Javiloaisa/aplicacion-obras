from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import SessionLocal
from app.ratelimit import limiter
from app.routers import auth, informes, media, obras, partes, usuarios
from app.services.seed import seed_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        seed_admin(db)
    yield


app = FastAPI(title="Partes de Obra API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(obras.router, prefix="/api/v1")
app.include_router(partes.router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
app.include_router(informes.router, prefix="/api/v1")
app.include_router(usuarios.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
