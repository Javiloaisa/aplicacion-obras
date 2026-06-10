import os

# Must be set before importing the app so Settings picks them up
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin-test-pass"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.deps import get_db
from app.main import app
from app.models import User
from app.security import hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

WORKER_PASSWORD = "worker-pass-123"
ADMIN_PASSWORD = "admin-pass-123"


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
        password_hash=hash_password(WORKER_PASSWORD),
        role="worker",
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin(db_session) -> User:
    user = User(
        username="jefe",
        full_name="Jefe Obra",
        password_hash=hash_password(ADMIN_PASSWORD),
        role="admin",
        must_change_password=False,
    )
    db_session.add(user)
    db_session.commit()
    return user
