"""Set a user's role and empresa (company) scope from the terminal.

Recovery tool: lets whoever has server access configure admins — including
restoring `acceso_todas_empresas` — without going through the panel. Useful
to set up the first admins after deploying the multi-empresa migration, or
to recover if every admin with access to a company loses it. Not required
as part of a normal deploy.

Usage:
    python -m app.scripts.asignar_usuario --email jefe@nido.com --rol admin --empresa todas
    python -m app.scripts.asignar_usuario --username juan.perez --rol worker --empresa fega
"""

import argparse
import sys
from typing import Sequence

from sqlalchemy import select

from app import database
from app.models import User
from app.services.empresas import (
    EmpresaNotFoundError,
    assign_user_empresa,
    get_empresa_by_slug,
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    identity = parser.add_mutually_exclusive_group(required=True)
    identity.add_argument("--email", help="Email del usuario a buscar")
    identity.add_argument("--username", help="Nombre de usuario a buscar")
    parser.add_argument("--rol", choices=["admin", "worker"], required=True)
    parser.add_argument(
        "--empresa",
        choices=["nido", "fega", "todas"],
        required=True,
        help="'todas' solo es válido para --rol admin",
    )
    args = parser.parse_args(argv)

    if args.rol == "worker" and args.empresa == "todas":
        print("Un trabajador no puede tener acceso a ambas empresas.", file=sys.stderr)
        return 1

    with database.SessionLocal() as db:
        stmt = select(User)
        stmt = (
            stmt.where(User.email == args.email)
            if args.email
            else stmt.where(User.username == args.username.lower())
        )
        user = db.scalar(stmt)
        if user is None:
            print("Usuario no encontrado.", file=sys.stderr)
            return 1

        try:
            empresa_id = (
                None
                if args.empresa == "todas"
                else get_empresa_by_slug(db, args.empresa).id
            )
        except EmpresaNotFoundError:
            print(f"Empresa '{args.empresa}' no existe en la base de datos.", file=sys.stderr)
            return 1

        user.role = args.rol
        assign_user_empresa(
            db,
            user,
            empresa_id=empresa_id,
            acceso_todas_empresas=(args.empresa == "todas"),
        )
        db.commit()

    print(f"OK: {user.username} -> rol={args.rol}, empresa={args.empresa}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
