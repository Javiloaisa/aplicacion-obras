from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import MediaFile, User, WorkEntry
from app.services.empresas import (
    EmpresaNotFoundError,
    assign_user_empresa,
    get_empresa_by_slug,
)


def test_worker_cannot_have_acceso_todas_empresas(db_session):
    user = User(
        username="w-todas",
        full_name="Worker Todas",
        password_hash="x",
        role="worker",
        acceso_todas_empresas=True,
    )
    db_session.add(user)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_admin_requires_empresa_or_acceso_todas(db_session):
    user = User(
        username="admin-sin-ambito",
        full_name="Admin Sin Ambito",
        password_hash="x",
        role="admin",
    )
    db_session.add(user)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_admin_cannot_have_empresa_and_acceso_todas_together(db_session, empresa_nido):
    user = User(
        username="admin-conflicto",
        full_name="Admin Conflicto",
        password_hash="x",
        role="admin",
        empresa_id=empresa_nido.id,
        acceso_todas_empresas=True,
    )
    db_session.add(user)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_admin_with_single_empresa_is_valid(db_session, empresa_nido):
    user = User(
        username="admin-nido",
        full_name="Admin Nido",
        password_hash="x",
        role="admin",
        empresa_id=empresa_nido.id,
    )
    db_session.add(user)
    db_session.commit()
    assert user.empresa_id == empresa_nido.id
    assert user.acceso_todas_empresas is False


def test_admin_with_acceso_todas_is_valid(db_session):
    user = User(
        username="admin-todas",
        full_name="Admin Todas",
        password_hash="x",
        role="admin",
        acceso_todas_empresas=True,
    )
    db_session.add(user)
    db_session.commit()
    assert user.empresa_id is None
    assert user.acceso_todas_empresas is True


def test_worker_pending_by_default(db_session, worker):
    assert worker.empresa_id is None
    assert worker.acceso_todas_empresas is False


def test_get_empresa_by_slug_unknown_raises(db_session):
    with pytest.raises(EmpresaNotFoundError):
        get_empresa_by_slug(db_session, "does-not-exist")


def test_assign_user_empresa_inherits_pending_records(
    db_session, worker, obra, empresa_nido, empresa_fega
):
    pending_entry = WorkEntry(
        obra_id=obra.id, user_id=worker.id, work_date=date(2026, 1, 5), hours="4.00"
    )
    already_assigned_entry = WorkEntry(
        obra_id=obra.id,
        user_id=worker.id,
        work_date=date(2026, 1, 6),
        hours="3.00",
        empresa_id=empresa_fega.id,
    )
    pending_media = MediaFile(
        obra_id=obra.id,
        user_id=worker.id,
        kind="photo",
        original_filename="foto.jpg",
        storage_path="x/y.jpg",
        mime_type="image/jpeg",
        size_bytes=100,
    )
    db_session.add_all([pending_entry, already_assigned_entry, pending_media])
    db_session.commit()

    assign_user_empresa(db_session, worker, empresa_id=empresa_nido.id)
    db_session.commit()
    db_session.refresh(pending_entry)
    db_session.refresh(already_assigned_entry)
    db_session.refresh(pending_media)

    assert worker.empresa_id == empresa_nido.id
    assert pending_entry.empresa_id == empresa_nido.id
    assert pending_media.empresa_id == empresa_nido.id
    # Records already assigned elsewhere never move on a later reassignment
    assert already_assigned_entry.empresa_id == empresa_fega.id


def test_assign_user_empresa_todas_does_not_inherit(db_session, worker, obra, empresa_nido):
    pending_entry = WorkEntry(
        obra_id=obra.id, user_id=worker.id, work_date=date(2026, 1, 5), hours="4.00"
    )
    db_session.add(pending_entry)
    db_session.commit()

    # Set role and empresa scope together: an admin can never be committed
    # with neither empresa_id nor acceso_todas_empresas set.
    worker.role = "admin"
    assign_user_empresa(db_session, worker, empresa_id=None, acceso_todas_empresas=True)
    db_session.commit()
    db_session.refresh(pending_entry)

    assert worker.acceso_todas_empresas is True
    assert worker.empresa_id is None
    assert pending_entry.empresa_id is None
