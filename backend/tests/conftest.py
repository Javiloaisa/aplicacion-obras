import os
import tempfile

# Must be set before importing the app so Settings picks them up
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin-test-pass"
os.environ["MEDIA_ROOT"] = tempfile.mkdtemp(prefix="partes-media-test-")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.database as database
from app.database import Base
from app.deps import get_db
from app.main import app
from app.models import Empresa, Obra, User
from app.security import create_access_token, hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# Background tasks (thumbnails) open their own session via database.SessionLocal
database.SessionLocal = TestingSessionLocal

WORKER_PASSWORD = "worker-pass-123"
ADMIN_PASSWORD = "admin-pass-123"

# Hash once: bcrypt is deliberately slow and fixtures run per-test
_WORKER_HASH = hash_password(WORKER_PASSWORD)
_ADMIN_HASH = hash_password(ADMIN_PASSWORD)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def _setup_db():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    # No context manager: lifespan (admin seed) must not run against the test DB
    return TestClient(app)


@pytest.fixture
def worker(db_session) -> User:
    user = User(
        username="worker1",
        full_name="Trabajador Uno",
        password_hash=_WORKER_HASH,
        role="worker",
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def worker2(db_session) -> User:
    user = User(
        username="worker2",
        full_name="Trabajador Dos",
        password_hash=_WORKER_HASH,
        role="worker",
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin(db_session) -> User:
    # Mirrors the migration's backfill: pre-existing admins get access to
    # both companies rather than being left unable to see anything.
    user = User(
        username="jefe",
        full_name="Jefe Obra",
        password_hash=_ADMIN_HASH,
        role="admin",
        must_change_password=False,
        acceso_todas_empresas=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def obra(db_session, worker) -> Obra:
    """Active obra."""
    o = Obra(name="Reforma Calle Mayor 12", client_name="Cliente SL")
    db_session.add(o)
    db_session.commit()
    return o


@pytest.fixture
def other_obra(db_session) -> Obra:
    """Another active obra."""
    o = Obra(name="Nave Industrial Polígono Sur")
    db_session.add(o)
    db_session.commit()
    return o


@pytest.fixture
def empresa_nido(db_session) -> Empresa:
    e = Empresa(nombre="Nido Constructions", slug="nido")
    db_session.add(e)
    db_session.commit()
    return e


@pytest.fixture
def empresa_fega(db_session) -> Empresa:
    e = Empresa(nombre="Fega Juan", slug="fega")
    db_session.add(e)
    db_session.commit()
    return e


@pytest.fixture
def worker_nido(db_session, empresa_nido) -> User:
    user = User(
        username="worker-nido",
        full_name="Trabajador Nido",
        password_hash=_WORKER_HASH,
        role="worker",
        empresa_id=empresa_nido.id,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def worker_fega(db_session, empresa_fega) -> User:
    user = User(
        username="worker-fega",
        full_name="Trabajador Fega",
        password_hash=_WORKER_HASH,
        role="worker",
        empresa_id=empresa_fega.id,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_nido(db_session, empresa_nido) -> User:
    user = User(
        username="admin-nido",
        full_name="Admin Nido",
        password_hash=_ADMIN_HASH,
        role="admin",
        must_change_password=False,
        empresa_id=empresa_nido.id,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_fega(db_session, empresa_fega) -> User:
    user = User(
        username="admin-fega",
        full_name="Admin Fega",
        password_hash=_ADMIN_HASH,
        role="admin",
        must_change_password=False,
        empresa_id=empresa_fega.id,
    )
    db_session.add(user)
    db_session.commit()
    return user


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def worker_headers(worker):
    return auth_headers(worker)


@pytest.fixture
def worker2_headers(worker2):
    return auth_headers(worker2)


@pytest.fixture
def admin_headers(admin):
    return auth_headers(admin)


@pytest.fixture
def worker_nido_headers(worker_nido):
    return auth_headers(worker_nido)


@pytest.fixture
def worker_fega_headers(worker_fega):
    return auth_headers(worker_fega)


@pytest.fixture
def admin_nido_headers(admin_nido):
    return auth_headers(admin_nido)


@pytest.fixture
def admin_fega_headers(admin_fega):
    return auth_headers(admin_fega)
