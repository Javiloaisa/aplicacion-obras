# CLAUDE.md — Partes de Obra

## Qué es este proyecto

Sistema para una empresa de construcción/instalaciones formado por **dos aplicaciones separadas** que comparten una misma API y base de datos:

1. **`app-trabajador/`** — PWA móvil, instalable, mínima y muy simple: los trabajadores suben fotos y vídeos de la obra y registran sus horas trabajadas.
2. **`panel-admin/`** — Aplicación web para el jefe (escritorio principalmente): gestiona obras, asigna trabajadores, revisa todo el material multimedia, consulta y edita las horas, y exporta informes.
3. **`backend/`** — API REST común (FastAPI + PostgreSQL) que sirve a las dos.

La especificación funcional completa está en `ESPECIFICACION.md`. **Léela antes de escribir código.**

## Stack (no cambiar sin preguntar)

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL 16
- **Auth**: JWT (access + refresh) con `python-jose`, hash con `passlib[bcrypt]`
- **app-trabajador**: React 18 + Vite + TypeScript + Tailwind CSS. PWA con `vite-plugin-pwa` (Workbox) y cola offline con IndexedDB (`idb`). Sin shadcn/ui: componentes propios mínimos, botones grandes, mobile-first.
- **panel-admin**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui. NO es PWA. Pensado para escritorio, responsive.
- **Almacenamiento de media**: sistema de ficheros local del VPS en `/data/media/` (volumen Docker). NO usar S3.
- **Miniaturas**: Pillow para fotos, ffmpeg para frame de vídeo
- **Infra**: Docker Compose (servicios: `api`, `app`, `admin`, `db`, `caddy`), Caddy como reverse proxy con HTTPS automático y tres subdominios: `app.`, `admin.`, `api.`
- **Despliegue objetivo**: VPS Hetzner (Ubuntu)

## Estructura del repo (monorepo)

```
/
├── CLAUDE.md
├── ESPECIFICACION.md
├── docker-compose.yml
├── Caddyfile
├── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py          # pydantic-settings, lee .env
│   │   ├── database.py
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic schemas
│   │   ├── routers/           # auth, obras, partes, media, usuarios, informes
│   │   ├── services/          # storage, thumbnails, export
│   │   └── deps.py            # get_db, get_current_user, require_admin
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── app-trabajador/            # PWA del trabajador
│   ├── src/
│   │   ├── pages/             # Login, MisObras, Obra, Parte, Subida, Historial
│   │   ├── components/
│   │   ├── lib/               # api client, auth, offline-queue (IndexedDB)
│   │   └── App.tsx
│   ├── public/                # manifest, iconos
│   ├── vite.config.ts
│   └── Dockerfile
└── panel-admin/               # Panel del jefe
    ├── src/
    │   ├── pages/             # Dashboard, Obras, ObraDetalle, Informes, Usuarios
    │   ├── components/
    │   ├── lib/               # api client, auth
    │   └── App.tsx
    ├── vite.config.ts
    └── Dockerfile
```

Crear un pequeño paquete compartido NO es necesario: los tipos TypeScript de la API se duplican en `lib/types.ts` de cada frontend (la API es la fuente de verdad).

## Convenciones

- Código y comentarios en **inglés**; textos de interfaz en **español** (es-ES).
- Endpoints REST en `/api/v1/...`. Errores con formato `{"detail": "..."}`.
- Toda ruta protegida por JWT salvo `/api/v1/auth/login` y `/health`.
- El login en `panel-admin` rechaza usuarios con rol `worker`; el de `app-trabajador` acepta ambos roles pero solo muestra la vista de trabajador.
- Rutas de admin protegidas con dependencia `require_admin` en el backend (la separación de frontends NO es una medida de seguridad: la seguridad vive en la API).
- Migraciones siempre con Alembic; nunca `create_all` en producción.
- Validar tipo y tamaño de archivos en el backend: fotos JPEG/PNG/WebP/HEIC máx 15 MB, vídeos MP4/MOV/WebM máx 200 MB. Verificar magic bytes, no solo extensión.
- Archivos guardados como `/data/media/{obra_id}/{uuid}.{ext}` + miniatura `{uuid}_thumb.jpg`. Nombre original en BD.
- Nunca servir `/data/media` público: endpoint autenticado con `FileResponse` que comprueba permisos.
- Zona horaria `Europe/Madrid` para mostrar; UTC en BD.
- CORS en la API restringido a los orígenes de `app.` y `admin.` (+ localhost en dev).
- Commits convencionales (`feat:`, `fix:`...), mensajes en inglés.

## Comandos útiles

```bash
# Desarrollo
docker compose up -d db
cd backend && uvicorn app.main:app --reload          # API en :8000
cd app-trabajador && npm run dev                     # :5173
cd panel-admin && npm run dev                        # :5174

# Migraciones
cd backend && alembic revision --autogenerate -m "msg" && alembic upgrade head

# Tests
cd backend && pytest

# Producción (VPS)
docker compose up -d --build
```

## Orden de trabajo recomendado

1. Esqueleto del monorepo + docker-compose + Caddyfile + .env.example
2. Backend: modelos + migración inicial + auth (JWT, seed de admin)
3. Backend: CRUD obras, partes de trabajo (horas), subida de media con miniaturas
4. Backend: informes (resumen de horas) + export CSV
5. **app-trabajador**: login, mis obras, crear parte, subir fotos/vídeos, historial
6. **app-trabajador**: PWA (manifest, service worker, cola offline de subidas)
7. **panel-admin**: login, dashboard, obras + galería + horas, informes, usuarios
8. Caddyfile definitivo + `DEPLOY.md`

## Qué NO hacer

- No añadir funcionalidades fuera de `ESPECIFICACION.md` sin preguntar.
- No usar Celery/Redis ni ORM async: volumen bajo, miniaturas con `BackgroundTasks` de FastAPI.
- No guardar datos personales sensibles más allá de nombre, email/usuario y teléfono opcional.
- No exponer la BD ni la API directamente: todo pasa por Caddy.
- No convertir el panel-admin en PWA ni añadirle modo offline: no lo necesita.
