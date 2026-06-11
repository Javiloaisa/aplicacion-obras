# ESTADO.md — Dónde nos quedamos (11/06/2026)

Documento de traspaso de sesión. Léelo junto a `CLAUDE.md` y `ESPECIFICACION.md` antes de continuar.

## Resumen en una línea

**App base completa + identidad de marca Nido Constructions + funciones de venta (oficios/coste, PDF, ZIP, gráficas).** Repo `Javiloaisa/aplicacion-obras`, rama `master`. Verificación de código completa (89 tests, builds, smoke runtime); falta el e2e con `docker compose` real y la prueba de PWA en un móvil físico.

## Novedades — versión de venta (11/06/2026)

Sobre la base de los 8 pasos originales se añadió:

1. **Foto dentro del parte**: en la app del trabajador, el parte de horas permite adjuntar fotos/vídeos (cámara o galería) **vinculados a ese parte** (`work_entry_id`); la cola offline mantiene el vínculo aunque se cree sin conexión (clientRef → id real al reenviar). Se **eliminó** el botón suelto "Subir fotos/vídeos" de `ObraHome` y la pantalla `Subida.tsx` (las fotos se suben solo desde el parte).
2. **Identidad de marca Nido Constructions**: paleta `brand` (ámbar `#f9b414`) + `ink` (carbón `#32373c`) en ambos `tailwind.config.js`; cabecera/sidebar oscuros con el logo (`public/brand/logo.png`); iconos PWA y favicon regenerados desde la marca; nombres de app "Nido · Partes de obra" / "Nido · Panel de obras". El logo lleva texto blanco → solo se ve bien sobre fondo oscuro (de ahí las bandas carbón).
3. **Oficios**: `User.trade` (migración `0002`), texto libre con sugerencias (`TRADES` + oficios ya en uso, vía datalist) — se pueden crear oficios nuevos escribiéndolos. Informes con **resumen por oficio** (`by_trade`); CSV con columna oficio. Botón **Editar** usuario (PATCH). *Nota (11/06/2026): la tarifa €/h y todos los costes (`hourly_rate`, `total_cost`, tarjeta "coste semana", columnas de coste en CSV/PDF) se **eliminaron** a petición del cliente — migración `0003` borra la columna.*
4. **Informe PDF** (`reportlab`, sin libs de sistema): `GET /informes/horas/export.pdf` con cabecera de marca, totales, por-oficio y detalle. Logo en `backend/app/assets/logo.png`. Botón "Informe PDF" en Informes.
5. **ZIP de media** (`GET /obras/{id}/media/export.zip`, admin, `ZIP_STORED`, temp file + cleanup): botón "Descargar ZIP" en la galería. **Gráficas** en el dashboard con `recharts` (horas por obra y por oficio de la semana).

Pendiente sugerido para v2: aprobación de partes (workflow pendiente→aprobado), informe fotográfico en PDF.

## Verificación realizada (11/06/2026)

Tras clonar el repo en limpio en otra máquina (Windows, Python 3.11.9, Node 24; **sin Docker disponible**):

- **Backend**: `pip install -r requirements.txt` OK; **83 tests pasan** (`.venv/Scripts/python -m pytest -q`, 7.2 s).
- **Builds**: `app-trabajador` compila (tsc + vite, service worker PWA generado) y `panel-admin` compila (1848 módulos). Sin errores de TypeScript.
- **Smoke runtime sobre HTTP**: se arrancó `uvicorn` contra un SQLite local (tablas vía `create_all`, los modelos usan el tipo genérico `Uuid`, compatible). 14/14 comprobaciones OK cubriendo criterios de aceptación 3, 5 y 6: seed del admin, login admin, crear obra, crear worker (devuelve contraseña temporal una vez), **worker rechazado en `admin_panel` (403)**, login worker en `worker_app`, worker sin asignar no ve obras, asignación → la obra aparece al instante, parte de 8 h, **parte de 20 h rechazado (límite 16 h, 422)**, informe de horas y export CSV (`text/csv`).
- Artefactos del smoke test borrados (no se commitearon). Los `package-lock.json` mostraban churn cosmético de npm 11.8 (campos `libc`); revertido, árbol limpio.

Pendiente de verificar todavía: e2e con `docker compose up -d --build` (los 3 subdominios vía Caddy, Postgres real, miniaturas con Pillow/ffmpeg en background) y la PWA en un móvil real.

## Estado por componente

### Backend — COMPLETO (pasos 2-4)

- Modelos, migración inicial Alembic, auth JWT (access 30 min + refresh 30 días), seed de admin desde `.env`.
- CRUD de obras, partes de horas (cálculo desde inicio/fin, límites 0.25-16 h/parte y 24 h/día, ventana de edición de 48 h para workers), media con validación de magic bytes y miniaturas en background. *Nota (11/06/2026): las **asignaciones obra↔trabajador se eliminaron** a petición del cliente (migración `0004` borra `obra_assignments`): cualquier trabajador elige cualquier obra activa para fichar horas y subir fotos.*
- Informes: `GET /informes/horas` (agregado obra×trabajador), `GET /informes/horas/export.csv` (delimitador `;` + BOM UTF-8 para Excel es-ES), `GET /informes/obra/{id}/resumen`.
- Usuarios admin: alta con contraseña temporal (se devuelve una sola vez), PATCH para activar/desactivar/reset/rol, con guarda anti-bloqueo (un admin no puede desactivarse ni degradarse a sí mismo).
- `GET /media/recent` (admin) para la mini-galería del dashboard.
- **89 tests pasan** (`cd backend && .venv/Scripts/python -m pytest -q`) — incluye oficio/coste, PDF y ZIP.

### app-trabajador — COMPLETO (pasos 5-6)

- Pantallas: Login, CambiarPassword (obligatorio en primer acceso), MisObras (auto-entra si solo hay una, con flag en sessionStorage para no atrapar el botón atrás), ObraHome (3 botones grandes), Parte (modo inicio/fin u horas directas), Subida (cámara/galería, compresión canvas ~2560 px, progreso por archivo vía XMLHttpRequest), Actividad (partes + media propios por obra), Historial (semana/mes con total).
- PWA: `vite-plugin-pwa` con manifest (iconos 192/512 generados con Pillow en `public/icons/`), service worker con API network-first y miniaturas cache-first.
- Cola offline: `src/lib/offline-queue.ts` (IndexedDB vía `idb`). Si falla un parte o una subida por red, se encola y se reenvía al evento `online` o al abrir la app. Banner con contador en `OfflineBanner.tsx`. Errores 4xx se descartan (no se reintentan); 5xx/red sí.
- Las miniaturas autenticadas se cargan con `AuthImg` (fetch blob + object URL, porque `<img>` no puede enviar el JWT).

### panel-admin — COMPLETO (paso 7)

- shadcn/ui instalado **manualmente** (sin CLI): componentes en `src/components/ui/` (button, input, label, card, table, dialog con Radix, badge, select nativo estilizado, textarea, tabs propias). Tema con variables CSS en `index.css`, alias `@/` en vite y tsconfig.
- Páginas: Login (client `admin_panel`, la API rechaza workers), Dashboard (obras activas, horas de la semana por obra, trabajadores activos hoy, últimas subidas), Obras (tabla + buscador + crear/archivar), ObraDetalle con pestañas Galería/Horas (la pestaña va en `?tab=` de la URL; la pestaña Trabajadores se eliminó junto con las asignaciones), Informes (filtros + CSV), Usuarios (alta con diálogo de contraseña temporal, reset, activar/desactivar).
- El lightbox de la galería carga el original por fetch blob (también los vídeos; un vídeo de 200 MB se descarga entero antes de reproducir — limitación conocida aceptada para v1, el backend sí soporta Range).

### Infra/Docs — COMPLETO (pasos 1 y 8)

- `docker-compose.yml` (db, api, app, admin, caddy), `Caddyfile` (3 subdominios, HSTS, 250 MB en api.), `.env.example`, `DEPLOY.md` (guía Hetzner: DNS, Docker, backups con cron + rsync).

## Decisiones técnicas que conviene recordar

- **Entorno local**: no hay Python global con deps; el venv está en `backend/.venv` (Python 3.13 local, funciona aunque el proyecto declara 3.12). Tests: `.venv/Scripts/python -m pytest -q`.
- Se añadió `email-validator` a requirements (lo usa `EmailStr` en schemas de usuario).
- Tipos TS duplicados a propósito en `src/lib/types.ts` de cada frontend (decisión de CLAUDE.md, la API es la fuente de verdad).
- `panel-admin/tailwind.config.js` es ESM: usar `import`, **no** `require` (ya rompió el build una vez).
- Background Sync real del service worker no se implementó: la cola usa evento `online` + reintento al abrir la app (cubre el requisito de la spec como fallback documentado).
- No hubo cambios de modelo desde la migración inicial → no hay migraciones pendientes.

## Qué falta / siguientes pasos sugeridos

1. **Verificación end-to-end con Docker** (parcialmente hecha — ver "Verificación realizada"): falta `docker compose up -d --build` para validar Postgres real, Caddy con los 3 subdominios y la generación de miniaturas (Pillow/ffmpeg) en background. El nivel de código (tests, builds, smoke HTTP con SQLite) ya está verde.
2. Probar la PWA en un móvil real (instalación, cámara, modo avión para la cola offline).
3. Revisar la galería con vídeos grandes; si molesta, cambiar el lightbox a streaming con token en query (requeriría soporte en la API).
4. Despliegue real en el VPS siguiendo `DEPLOY.md`.

## Cómo arrancar en otro ordenador

```bash
git clone https://github.com/Javiloaisa/aplicacion-obras.git
cd aplicacion-obras
cp .env.example .env                      # rellenar valores
# Backend
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
# Frontends
cd ../app-trabajador && npm install
cd ../panel-admin && npm install
```

## Historial de commits de hoy

- `5400adc` informes (horas, CSV, resumen) + usuarios admin
- `db50b38` pantallas de app-trabajador
- `0499aed` PWA + cola offline
- `96452ab` panel-admin completo + GET /media/recent
- `427da96` DEPLOY.md
