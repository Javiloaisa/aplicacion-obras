# ESPECIFICACION.md — Partes de Obra

## 1. Resumen

Sistema compuesto por **dos aplicaciones independientes** sobre una **API común**:

- **App del trabajador (PWA)** — `app.{dominio}`: instalable en el móvil. El trabajador ve sus obras asignadas, registra las horas trabajadas (partes) y sube fotos y vídeos del trabajo realizado. Debe funcionar con mala cobertura: las subidas se encolan offline y se envían al recuperar conexión.
- **Panel del jefe** — `admin.{dominio}`: aplicación web de administración. El jefe crea y gestiona obras, asigna trabajadores, revisa todas las fotos/vídeos organizados por obra, consulta y corrige las horas de cada trabajador y exporta informes.
- **API** — `api.{dominio}`: FastAPI + PostgreSQL. Toda la lógica de negocio, permisos y almacenamiento de archivos vive aquí. Las dos aplicaciones son clientes de esta API.

## 2. Roles

| Rol | Aplicación | Capacidades |
|---|---|---|
| **Trabajador** | App PWA | Ver sus obras asignadas, registrar partes de horas, subir fotos/vídeos a sus obras, ver su propio historial |
| **Admin (jefe)** | Panel admin | Crear/editar/archivar obras, asignar trabajadores, ver/descargar/eliminar cualquier media, ver/editar/eliminar horas de cualquiera, exportar informes, crear/desactivar usuarios |

- No hay registro público: el admin crea las cuentas y entrega las credenciales. Primer login obliga a cambiar contraseña.
- El panel admin rechaza el login de usuarios `worker`. La app del trabajador permite entrar a un admin (verá la vista de trabajador), útil para que el jefe también pueda fichar y subir fotos si trabaja a pie de obra.
- **La seguridad se aplica en la API**, no en los frontends: cada endpoint comprueba rol y pertenencia.

## 3. Modelo de datos (PostgreSQL)

### users
- `id` (UUID, PK)
- `username` (único, lowercase)
- `full_name`
- `email` (opcional), `phone` (opcional)
- `password_hash`
- `role` (`admin` | `worker`)
- `is_active` (bool, default true)
- `must_change_password` (bool, default true)
- `created_at`

### obras
- `id` (UUID, PK)
- `name` (ej. "Reforma Calle Mayor 12")
- `client_name`, `address`, `description` (opcionales)
- `status` (`active` | `archived`)
- `created_at`, `archived_at` (nullable)

### obra_assignments
- `obra_id` (FK), `user_id` (FK) — PK compuesta
- `assigned_at`

### work_entries (partes de horas)
- `id` (UUID, PK)
- `obra_id` (FK), `user_id` (FK)
- `work_date` (date)
- `start_time`, `end_time` (time, opcionales)
- `hours` (numeric(4,2)) — calculadas de start/end si existen; si no, introducidas a mano
- `notes` (texto opcional, ej. "alicatado baño planta 1")
- `created_at`, `updated_at`
- `edited_by_admin` (bool, default false)
- Reglas: `hours` entre 0.25 y 16 por parte; máximo 24 h sumadas por trabajador y día.

### media_files
- `id` (UUID, PK)
- `obra_id` (FK), `user_id` (FK, quién lo subió)
- `work_entry_id` (FK nullable — opcionalmente vinculado a un parte)
- `kind` (`photo` | `video`)
- `original_filename`
- `storage_path` (relativo a `/data/media`), `thumbnail_path`
- `mime_type`, `size_bytes`
- `duration_seconds` (nullable, solo vídeo)
- `taken_at` (nullable, de EXIF si existe)
- `uploaded_at`
- `caption` (opcional)

## 4. API (FastAPI, prefijo `/api/v1`)

### Auth
- `POST /auth/login` — body incluye `client` (`worker_app` | `admin_panel`); si `client=admin_panel` y el usuario es `worker`, devolver 403. Respuesta: `{access_token, refresh_token, user}`
- `POST /auth/refresh`
- `POST /auth/change-password`

### Obras
- `GET /obras` — admin: todas (filtro `status`); worker: solo asignadas activas
- `POST /obras` (admin)
- `GET /obras/{id}` — incluye resumen: nº fotos, nº vídeos, total horas
- `PATCH /obras/{id}` (admin) — editar o archivar
- `POST /obras/{id}/assignments` (admin) — asignar/desasignar trabajadores
- `GET /obras/{id}/workers` (admin)

### Partes de trabajo (horas)
- `POST /obras/{id}/entries` — worker en sus obras; admin en cualquiera y para cualquier user
- `GET /obras/{id}/entries` — admin: todos, filtros `user_id`, `from`, `to`; worker: solo los suyos
- `GET /entries/mine?from=&to=` — historial del trabajador (con totales)
- `PATCH /entries/{id}` — worker: solo los suyos y dentro de las 48 h tras crearlos; admin: cualquiera (marca `edited_by_admin`)
- `DELETE /entries/{id}` — mismas reglas que PATCH

### Media
- `POST /obras/{id}/media` — multipart, varios archivos; valida tipo/tamaño/magic bytes; miniatura en background (`BackgroundTasks`)
- `GET /obras/{id}/media?kind=&user_id=&from=&to=&page=` — listado paginado (metadatos + URLs de miniatura)
- `GET /media/{id}/file` — descarga/stream autenticado del original (soportar `Range` para vídeo)
- `GET /media/{id}/thumb` — miniatura autenticada
- `PATCH /media/{id}` — editar caption (autor o admin)
- `DELETE /media/{id}` — autor dentro de 48 h, o admin

### Informes (admin)
- `GET /informes/horas?from=&to=&obra_id=&user_id=` — agregado: por obra → por trabajador → total horas y nº de partes
- `GET /informes/horas/export.csv?...` — CSV: obra, trabajador, fecha, inicio, fin, horas, notas
- `GET /informes/obra/{id}/resumen` — totales de la obra: horas por trabajador, nº fotos/vídeos, primer y último parte

### Usuarios (admin)
- `GET /usuarios`, `POST /usuarios` (devuelve contraseña temporal una sola vez), `PATCH /usuarios/{id}` (activar/desactivar, reset contraseña, cambiar rol)

### Otros
- `GET /health`

## 5. App del trabajador (PWA) — `app-trabajador/`

**Principio de diseño: que un trabajador con guantes y prisa pueda usarla.** Botones grandes, mínimo texto, máximo 2-3 toques para cualquier acción.

### Pantallas
1. **Login** (+ cambio de contraseña obligatorio la primera vez). Sesión persistente: no pedir login cada día.
2. **Mis obras**: tarjetas grandes con las obras activas asignadas. Si solo tiene una, entrar directamente.
3. **Obra** — 3 botones grandes:
   - **➕ Parte de horas**: fecha (hoy por defecto), modo A: hora inicio + hora fin (calcula horas), modo B: campo numérico de horas directo. Notas opcionales. Guardar.
   - **📷 Subir fotos/vídeos**: `<input type="file" accept="image/*,video/*" capture="environment" multiple>` para abrir cámara o galería; previsualización, caption opcional, barra de progreso por archivo, compresión de fotos en cliente antes de subir (canvas, máx ~2560 px lado largo) para ahorrar datos.
   - **🕓 Mi actividad**: sus partes y media en esta obra.
4. **Historial**: horas de la semana y del mes con total destacado.

### Requisitos PWA
- `manifest.json` (nombre, iconos 192/512, `display: standalone`), instalable en Android e iOS.
- Service worker (Workbox vía `vite-plugin-pwa`): precache del shell; API network-first.
- **Cola offline**: si falla la subida de media o el guardado de un parte por falta de conexión, se guarda en IndexedDB y se reintenta automáticamente (Background Sync si está disponible; si no, al volver online o abrir la app). Banner visible "X elementos pendientes de enviar".
- Tokens en `localStorage` con refresh automático.

## 6. Panel del jefe — `panel-admin/`

Aplicación web clásica (NO PWA), optimizada para escritorio, responsive para poder consultarla desde el móvil. shadcn/ui para tablas, diálogos y formularios.

### Pantallas
1. **Login** (solo admins).
2. **Dashboard**: obras activas, horas registradas esta semana (total y por obra), últimas subidas (mini-galería), trabajadores activos hoy.
3. **Obras**: tabla con buscador y filtro activas/archivadas; crear obra; archivar; acceso al detalle.
4. **Detalle de obra** con pestañas:
   - **Galería**: grid de miniaturas, filtros por trabajador/fecha/tipo, lightbox con reproductor de vídeo, descargar original, eliminar, ver caption y autor/fecha.
   - **Horas**: tabla de partes con filtros por trabajador y rango de fechas, totales por trabajador, editar/eliminar partes, botón "Exportar CSV".
   - **Trabajadores**: asignar/desasignar (multi-select con búsqueda).
5. **Informes**: rango de fechas + filtros obra/trabajador, tabla agregada obra×trabajador con totales, exportar CSV.
6. **Usuarios**: alta de trabajador (muestra contraseña temporal una sola vez), activar/desactivar, reset de contraseña.

## 7. Seguridad

- Bcrypt para contraseñas. Access token 30 min, refresh 30 días.
- Rate limit en `/auth/login` (slowapi, 10/min por IP).
- Autorización en cada endpoint: un worker solo accede a obras asignadas y solo modifica sus registros. La separación app/panel es solo UX, nunca el control de acceso.
- Validación de archivos por magic bytes; límites por archivo y por petición.
- CORS: la API solo acepta los orígenes `https://app.{dominio}` y `https://admin.{dominio}` (+ localhost:5173/5174 en dev).
- Caddy: HTTPS automático (Let's Encrypt), HSTS, `request_body` máx 250 MB solo en `api.`.

## 8. Despliegue

- `docker-compose.yml`: `db` (postgres:16, volumen `pgdata`), `api` (uvicorn, volumen `media:/data/media`), `app` (estáticos de app-trabajador), `admin` (estáticos de panel-admin), `caddy` (80/443).
- `Caddyfile` con tres sites: `app.{$DOMAIN}` → servicio `app`, `admin.{$DOMAIN}` → servicio `admin`, `api.{$DOMAIN}` → servicio `api`.
- `.env.example`: `DOMAIN`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `MAX_PHOTO_MB=15`, `MAX_VIDEO_MB=200`.
- Seed automático del admin al arrancar la API si no existe.
- `DEPLOY.md`: pasos para VPS Ubuntu de Hetzner (Docker, clonar, .env, DNS de los 3 subdominios, `docker compose up -d`) y backups (dump de Postgres + rsync de `/data/media`).

## 9. Fuera de alcance (v1)

Geolocalización de fichajes, firma digital de partes, notificaciones push, multiempresa, app nativa, integración con nóminas. Posibles para v2.

## 10. Criterios de aceptación

1. Un trabajador, con la PWA instalada en el móvil: entra, elige su obra, sube 3 fotos y 1 vídeo con la cámara y registra un parte de 8 h con notas, en menos de un minuto.
2. Sin cobertura, todo queda en cola con indicador visible y se envía solo al recuperar conexión.
3. El jefe, desde el panel: crea una obra, asigna 2 trabajadores, y estos la ven al instante en su app.
4. El jefe ve la galería de la obra con miniaturas, filtra por trabajador, reproduce un vídeo y descarga un original.
5. El jefe consulta las horas de la obra agrupadas por trabajador y exporta el CSV del mes.
6. Un usuario `worker` no puede hacer login en el panel admin, y aunque llame a la API directamente no puede ver ni tocar nada de obras no asignadas ni partes ajenos (verificado con tests).
7. `pytest` pasa con tests de auth, permisos, validación de archivos y cálculo/límites de horas.
