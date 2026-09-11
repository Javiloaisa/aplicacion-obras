from datetime import date

from app.models import User, WorkEntry
from app.scripts.asignar_usuario import main


def test_assign_worker_by_username(db_session, worker, obra, empresa_nido, empresa_fega):
    pending_entry = WorkEntry(
        obra_id=obra.id, user_id=worker.id, work_date=date(2026, 1, 5), hours="4.00"
    )
    db_session.add(pending_entry)
    db_session.commit()

    code = main(["--username", worker.username, "--rol", "worker", "--empresa", "nido"])
    assert code == 0

    db_session.refresh(worker)
    db_session.refresh(pending_entry)
    assert worker.empresa_id == empresa_nido.id
    assert worker.acceso_todas_empresas is False
    assert pending_entry.empresa_id == empresa_nido.id


def test_assign_admin_by_email_to_todas(db_session, empresa_nido, empresa_fega):
    user = User(
        username="futuro-admin",
        full_name="Futuro Admin",
        email="futuro@example.com",
        password_hash="x",
        role="worker",
    )
    db_session.add(user)
    db_session.commit()

    code = main(["--email", "futuro@example.com", "--rol", "admin", "--empresa", "todas"])
    assert code == 0

    db_session.refresh(user)
    assert user.role == "admin"
    assert user.acceso_todas_empresas is True
    assert user.empresa_id is None


def test_worker_cannot_be_assigned_todas(db_session, worker, empresa_nido, empresa_fega):
    code = main(["--username", worker.username, "--rol", "worker", "--empresa", "todas"])
    assert code == 1
    db_session.refresh(worker)
    assert worker.empresa_id is None
    assert worker.acceso_todas_empresas is False


def test_unknown_user_returns_error(db_session, empresa_nido):
    code = main(["--username", "no-existe", "--rol", "worker", "--empresa", "nido"])
    assert code == 1


def test_unknown_empresa_returns_error(db_session, worker):
    # No empresa_nido/empresa_fega fixture used here: the `empresas` table is empty
    code = main(["--username", worker.username, "--rol", "worker", "--empresa", "nido"])
    assert code == 1
