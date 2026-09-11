# ESPECIFICACION.md — Partes de Obra

## 1. Resumen

Sistema compuesto por **dos aplicaciones independientes** sobre una **API común**:

- **App del trabajador (PWA)** — `app.{dominio}`: instalable en el móvil. El trabajador ve sus obras asignadas, registra las horas trabajadas (partes) y sube fotos y vídeos del trabajo realizado. Debe funcionar con mala cobertura: las subidas se encolan offline y se envían al recuperar conexión.
- **Panel del jefe** — `admin.{dominio}`: aplicación web de administración. El jefe crea y gestiona obras, asigna trabajadores, revisa todas las fotos/vídeos organizados por obra, consulta y corrige las horas de cada trabajador y exporta informes.
- **API** — `api.{dominio}`: FastAPI + PostgreSQL. Toda la lógica de negocio, permisos y almacenamiento de archivos vive aquí. Las dos aplicaciones son clientes de esta API.

## 2. Roles

| Rol | Aplicación | Capacidades |
|---|---|---|
| **Trabajador** | App PWA | Ver las obras de su empresa, registrar partes de horas, subir fotos/vídeos a sus obras, ver su propio historial |
| **Admin (jefe)** | Panel admin | Crear/editar/archivar obras, ver/descargar/eliminar cualquier media, ver/editar/eliminar horas de cualquiera, exportar informes, crear/desactivar usuarios — todo dentro de su ámbito de empresa (ver §11) |

- No hay registro público: el admin crea las cuentas y entrega las credenciales. Primer login obliga a cambiar contraseña.
- El panel admin rechaza el login de usuarios `worker`. La app del trabajador permite entrar a un admin (verá la vista de trabajador), útil para que el jefe también pueda fichar y subir fotos si trabaja a pie de obra.
- **La seguridad se aplica en la API**, no en los frontends: cada endpoint comprueba rol, pertenencia y **empresa** (§11).
- Desde la migración a multiempresa (§11), el rol ya no basta para saber qué puede ver un admin: también depende de su `empresa_id` / `acceso_todas_empresas`. No hay un rol `superadmin` separado — el acceso a ambas empresas es una propiedad del admin, no un rol distinto.

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
- `empresa_id` (FK a `empresas`, **nullable** — ver §11), `acceso_todas_empresas` (bool, default false — solo admins)

### obras
- `id` (UUID, PK)
- `name` (ej. "Reforma Calle Mayor 12")
- `client_name`, `address`, `description` (opcionales)
- `status` (`active` | `archived`)
- `created_at`, `archived_at` (nullable)
- M2M con `empresas` vía `obra_empresas` (§11); sin filas ahí = obra sin asignar

### obra_assignments
- **Eliminada.** No existe concepto de "obra asignada a un trabajador": cualquier trabajador ve todas las obras activas de su empresa (§11). No confundir con `obra_empresas` (§11), que es la relación obra↔empresa, no obra↔trabajador.

### work_entries (partes de horas)
- `id` (UUID, PK)
- `obra_id` (FK), `user_id` (FK)
- `work_date` (date)
- `start_time`, `end_time` (time, opcionales)
- `hours` (numeric(4,2)) — calculadas de start/end si existen; si no, introducidas a mano
- `notes` (texto opcional, ej. "alicatado baño planta 1")
- `created_at`, `updated_at`
- `edited_by_admin` (bool, default false)
- `validated` (bool, default false) — el admin valida cada parte individualmente; cualquier edición posterior de fecha/horas lo vuelve a marcar como no validado
- `empresa_id` (FK a `empresas`, **nullable** — ver §11): la empresa del trabajador dueño del parte, nunca aceptada del body
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
- `empresa_id` (FK a `empresas`, **nullable** — ver §11): propia, no derivada del autor por join; ver reglas de asignación en §11

### empresas (§11)
- `id` (UUID, PK), `nombre`, `slug` (único: `nido` | `fega`)

### obra_empresas (§11)
- `obra_id` (FK, `ON DELETE CASCADE`), `empresa_id` (FK) — PK compuesta

## 4. API (FastAPI, prefijo `/api/v1`)

### Auth
- `POST /auth/login` — body incluye `client` (`worker_app` | `admin_panel`); si `client=admin_panel` y el usuario es `worker`, devolver 403. Respuesta: `{access_token, refresh_token, user}`
- `POST /auth/refresh`
- `POST /auth/change-password`

### Obras
- `GET /obras` — admin: todas dentro de su ámbito (filtro `status`, filtro `empresa` si es admin de ambas — §11); worker: activas de su empresa
- `POST /obras` (admin) — se crea sin empresas asignadas; ver `PUT .../empresas`
- `GET /obras/{id}` — incluye resumen: nº fotos, nº vídeos, total horas; 404 si está fuera de ámbito
- `PATCH /obras/{id}` (admin) — editar o archivar; 404 si está fuera de ámbito
- `PUT /obras/{id}/empresas` (admin) — sustituye el conjunto de empresas de la obra (`{"empresas": ["nido","fega"]}`, `[]` = sin asignar) — §11
- `POST /obras/asignar-empresas` (admin) — igual que arriba pero para varias obras a la vez (`obra_ids` + `empresas`) — §11
- ~~`POST /obras/{id}/assignments`~~ / ~~`GET /obras/{id}/workers`~~ — no existen: no hay concepto de obra asignada a un trabajador

### Partes de trabajo (horas)
- `POST /obras/{id}/entries` — worker en obras de su empresa; admin en cualquiera dentro de su ámbito y para cualquier user. `empresa_id` del parte se asigna en el backend a partir del trabajador destino, nunca del body; 404 si la obra no admite su empresa (§11)
- `GET /obras/{id}/entries` — admin: todos dentro de su ámbito, filtros `user_id`, `from`, `to`; worker: solo los suyos
- `GET /entries/mine?from=&to=` — historial del trabajador (con totales)
- `PATCH /entries/{id}` — worker: solo los suyos y mientras no estén validados por el admin; admin: cualquiera dentro de su ámbito (marca `edited_by_admin`); cambiar `obra_id` solo lo puede hacer el admin, y solo a una obra que admita la empresa del parte. 404 si el parte está fuera de ámbito
- `DELETE /entries/{id}` — mismas reglas que PATCH
- `PATCH /entries/{id}/validate` (admin) — body `{validated: bool}`; marca/desmarca el parte como validado; 404 si está fuera de ámbito

### Media
- `POST /obras/{id}/media` — multipart, varios archivos; valida tipo/tamaño/magic bytes; miniatura en background (`BackgroundTasks`). `empresa_id` se resuelve en el backend (worker/admin de una empresa: la suya; admin de ambas: campo `empresa` obligatorio del formulario si no va ligado a un parte; ligado a un parte: hereda la suya) — §11
- `GET /obras/{id}/media?kind=&user_id=&from=&to=&page=` — listado paginado (metadatos + URLs de miniatura), filtrado también por empresa dentro de una obra compartida
- `GET /media/{id}/file` — descarga/stream autenticado del original (soportar `Range` para vídeo); 404 si está fuera de ámbito
- `GET /media/{id}/thumb` — miniatura autenticada; 404 si está fuera de ámbito
- `PATCH /media/{id}` — editar caption (autor o admin dentro de ámbito)
- `DELETE /media/{id}` — autor dentro de 48 h, o admin dentro de ámbito
- Los archivos **nunca** se sirven como estáticos: todo pasa por estos dos endpoints autenticados (Caddy solo hace proxy de `/api/*`), así que el filtro por empresa ya protege el acceso — no hacen falta URLs firmadas (§11)

### Informes (admin)
- `GET /informes/horas?from=&to=&obra_id=&user_id=` — agregado por obra → trabajador (total horas y nº de partes) y listado de partes individuales (`entries`) con fecha y estado `validated`, dentro de ámbito
- `GET /informes/horas/export.csv?...` — CSV: obra, trabajador, fecha, inicio, fin, horas, validado, notas (+ columna `empresa` si el ámbito es "todas")
- `GET /informes/horas/export.pdf?...` — PDF con marca: totales, por oficio, por obra y trabajador, detalle por día (empresa junto al nombre del trabajador si el ámbito es "todas")
- `GET /informes/horas/export.xlsx?...` — Excel editable (Excel/Google Sheets): hoja "Resumen" con totales como fórmulas sobre la hoja "Detalle" (un parte por fila, horas como duración `[h]:mm`; columna Empresa al final si el ámbito es "todas")
- `GET /informes/obra/{id}/resumen` — totales de la obra: horas por trabajador, nº fotos/vídeos, primer y último parte; 404 si la obra está fuera de ámbito

### Usuarios (admin)
- `GET /usuarios` — dentro de ámbito (§11); un admin con `acceso_todas_empresas` nunca ve a otro admin con `acceso_todas_empresas` salvo que él mismo esté sin filtrar
- `POST /usuarios` (devuelve contraseña temporal una sola vez) — **sin restricción de ámbito**: cualquier admin da de alta en cualquier empresa; `empresa` obligatorio en el body (`nido` | `fega` | `todas`, esta última solo con `role=admin`)
- `PATCH /usuarios/{id}` (activar/desactivar, reset contraseña, fijar `new_password` propia, cambiar rol) — dentro de ámbito (404 si no); no cambia `empresa_id`/`acceso_todas_empresas` (eso va por `POST /usuarios/asignar-empresa`, §11)
- `DELETE /usuarios/{id}` — dentro de ámbito; borrado físico; rechaza si el usuario tiene partes de horas o media asociados (desactivar en su lugar) o si es la propia cuenta del admin
- `GET /usuarios/{id}/password` — dentro de ámbito

### Otros
- `GET /health`

## 5. App del trabajador (PWA) — `app-trabajador/`

**Principio de diseño: que un trabajador con guantes y prisa pueda usarla.** Botones grandes, mínimo texto, máximo 2-3 toques para cualquier acción.

### Pantallas
1. **Login** (+ cambio de contraseña obligatorio la primera vez). Sesión persistente: no pedir login cada día.
2. **Parte de horas (pantalla principal)**: desplegable para elegir la obra (si solo tiene una activa, se preselecciona), fecha (hoy por defecto), modo A: hora inicio + hora fin (calcula horas), modo B: campo numérico de horas directo, notas opcionales, fotos/vídeos del trabajo con dos opciones —**Cámara** (`capture="environment"`) y **Galería** (sin `capture`, para elegir archivos ya guardados en Android e iOS)—, previsualización, compresión en cliente antes de subir. Debajo del botón "Guardar parte", un botón lleva al Historial.
3. **Historial**: horas de la semana y del mes con total destacado; cada parte muestra su fecha, obra y si el administrador ya lo ha validado. Mientras un parte siga **pendiente de validar**, el trabajador puede **editarlo o eliminarlo**; una vez validado queda bloqueado.

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
   - **Horas**: tabla de partes con filtros por trabajador y rango de fechas, totales por trabajador, editar (incluida la obra, por si el trabajador se equivocó al elegirla)/eliminar partes, validar/invalidar, botón "Exportar CSV".
   - **Trabajadores**: asignar/desasignar (multi-select con búsqueda).
5. **Informes**: rango de fechas + filtros obra/trabajador, listado de partes individuales con fecha y estado de validación, totales y desglose por oficio, exportar CSV/PDF/Excel.
6. **Usuarios**: alta de trabajador (muestra contraseña temporal una sola vez), activar/desactivar, reset de contraseña aleatoria o fijar una contraseña propia, eliminar (bloqueado si tiene horas o media registrados).

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

Geolocalización de fichajes, firma digital de partes, notificaciones push, app nativa, integración con nóminas. Posibles para v2.

(Multiempresa dejó de estar fuera de alcance: ver §11.)

## 10. Criterios de aceptación

1. Un trabajador, con la PWA instalada en el móvil: entra, elige su obra, sube 3 fotos y 1 vídeo con la cámara y registra un parte de 8 h con notas, en menos de un minuto.
2. Sin cobertura, todo queda en cola con indicador visible y se envía solo al recuperar conexión.
3. El jefe, desde el panel: crea una obra, asigna 2 trabajadores, y estos la ven al instante en su app.
4. El jefe ve la galería de la obra con miniaturas, filtra por trabajador, reproduce un vídeo y descarga un original.
5. El jefe consulta las horas de la obra agrupadas por trabajador y exporta el CSV del mes.
6. Un usuario `worker` no puede hacer login en el panel admin, y aunque llame a la API directamente no puede ver ni tocar nada de obras no asignadas ni partes ajenos (verificado con tests).
7. `pytest` pasa con tests de auth, permisos, validación de archivos y cálculo/límites de horas.
8. Un admin de Nido no ve ni puede tocar obras, partes, media ni usuarios exclusivos de Fega (ni al revés), incluso llamando a la API directamente (verificado con tests, §11).

## 11. Multiempresa (Nido Constructions / Fega Juan)

Dos empresas comparten la misma app y la misma API: **Nido Constructions** (construcción) y **Fega Juan** (fontanería y electricidad). Cada empresa solo ve lo suyo; una obra puede ser de una sola empresa o compartida por las dos.

### Modelo

- Tabla `empresas` (`nido`, `fega`) sembrada por la migración `0008_multiempresa`.
- `empresa_id` nullable en `users`, `work_entries` y `media_files`. `NULL` = **pendiente de clasificar** (ver "Transición" abajo).
- `obra_empresas` (M2M obra↔empresa). Una obra sin filas ahí está **sin asignar**: visible para todos, como una obra compartida.
- `acceso_todas_empresas` (bool) en `users`, solo para admins. Tres reglas a nivel de base de datos (`CHECK`):
  1. Solo un admin puede tener `acceso_todas_empresas = true`.
  2. Si `acceso_todas_empresas = true`, `empresa_id` debe ser `NULL` (es lo que lo distingue de un trabajador pendiente).
  3. Todo admin tiene `empresa_id` **o** `acceso_todas_empresas` — nunca ninguno de los dos (a diferencia de un trabajador, un admin nunca queda "pendiente").

### Ámbito de cada petición (`scope_empresa`, `backend/app/deps.py`)

- Admin con `acceso_todas_empresas`: el query param opcional `empresa=nido|fega` decide el ámbito de esa petición (ausente = todas). Aplica a **todas** las llamadas del panel, no solo a los listados (ver "selector de cabecera" en `panel-admin`).
- Resto de usuarios con empresa: siempre la suya, el query param se ignora.
- Trabajador sin empresa: sin filtro (ve todo, transición).
- Un recurso fuera de ámbito responde **404**, nunca 403, para no revelar que existe.

### Reglas de negocio

- Un parte pertenece a la empresa del trabajador que lo creó (o para quien se crea, si lo crea un admin en su nombre); `empresa_id` se asigna siempre en el backend, nunca desde el body.
- Un archivo de media tiene su propio `empresa_id` (no se deriva del autor por join): del trabajador que lo sube, del admin de una empresa, del que elige el admin de ambas al subir (obligatorio si no hay obra "Todas" seleccionada), o heredado del parte al que va ligado.
- Al asignar una empresa a un trabajador (`POST /usuarios/asignar-empresa`) o al bajar de ámbito un admin (`POST /me/empresa`), sus partes y media con `empresa_id IS NULL` heredan esa empresa en la misma transacción; los que ya tenían empresa no se tocan (`app/services/empresas.py::assign_user_empresa`).
- Los ficheros nunca se sirven como estáticos (Caddy solo hace proxy de `/api/*`), así que el filtro de ámbito en `GET /media/{id}/file` y `/thumb` ya protege el acceso: no hacen falta URLs firmadas.

### Transición (periodo actual)

El gerente clasifica a mano lo existente; nada se reclasifica automáticamente:

- Usuarios y obras previos a la migración quedan con `empresa_id NULL` / sin filas en `obra_empresas` — visibles para todos hasta que se clasifiquen desde el panel (sección "Sin asignar").
- Excepción: la migración `0008` pone `acceso_todas_empresas = true` en **todos los admins existentes**, para que nadie pierda acceso al desplegar.
- Un trabajador sin empresa sigue viendo todas las obras y puede fichar en cualquiera, como antes de multiempresa.
- **Pendiente para cuando el gerente termine de clasificar** (no implementado, deliberadamente): una migración final que ponga `empresa_id NOT NULL` en `users` y `work_entries` (`media_files` puede quedar nullable si se acepta media histórica sin clasificar) y retire la lógica de "sin asignar" — el filtro `scope_empresa`, el fallback a "todos" para trabajadores sin empresa, y la sección "Sin asignar" del panel.

### Endpoints propios

- `GET /empresas`, `GET /empresas/pendientes` (conteo global de trabajadores/obras sin clasificar).
- `POST /usuarios/asignar-empresa` — clasifica trabajadores en bloque (nunca admins: nunca quedan pendientes).
- `PUT /obras/{id}/empresas`, `POST /obras/asignar-empresas` — sustituyen el conjunto de empresas de una o varias obras.
- `POST /me/empresa` — un admin con acceso a ambas se queda solo con una (nunca al revés); bloqueado si es el último admin con acceso a la que abandona.

### Herramienta de recuperación

`python -m app.scripts.asignar_usuario --email X --rol admin|worker --empresa nido|fega|todas` (o `--username`). Pensada para configurar las primeras cuentas tras desplegar y como último recurso si todos los admins pierden acceso a una empresa — no es parte del flujo normal de alta (eso es el panel).
