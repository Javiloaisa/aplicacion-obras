# DEPLOY.md — Despliegue en VPS (Hetzner, Ubuntu)

Guía para poner en producción **Partes de Obra** en un VPS Ubuntu 22.04/24.04.

## 1. Requisitos previos

- VPS con al menos 2 GB de RAM y 40 GB de disco (las fotos/vídeos viven en el VPS).
- Un dominio con acceso a la gestión de DNS.
- Acceso SSH como root o usuario con sudo.

## 2. DNS

Crea **tres registros A** apuntando a la IP del VPS (sustituye `example.com` por tu dominio):

| Tipo | Nombre | Valor |
|---|---|---|
| A | `app.example.com` | IP del VPS |
| A | `admin.example.com` | IP del VPS |
| A | `api.example.com` | IP del VPS |

Espera a que propaguen (puedes comprobarlo con `dig app.example.com`). Caddy emitirá los certificados HTTPS automáticamente cuando arranque.

## 3. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # opcional, para no usar sudo
```

## 4. Clonar y configurar

```bash
git clone <URL-DEL-REPO> partes-de-obra
cd partes-de-obra
cp .env.example .env
nano .env
```

Edita `.env`:

- `DOMAIN` — tu dominio (sin `app.`/`admin.`/`api.`).
- `POSTGRES_PASSWORD` — contraseña larga y aleatoria.
- `JWT_SECRET` — genera una con `openssl rand -hex 32`.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — cuenta inicial del jefe. El primer login obliga a cambiar la contraseña.

## 5. Arrancar

```bash
docker compose up -d --build
```

Qué ocurre al arrancar:

1. `db` (PostgreSQL 16) se inicializa con volumen persistente `pgdata`.
2. `api` ejecuta las migraciones de Alembic y crea el usuario admin si no existe.
3. `caddy` pide los certificados de Let's Encrypt para los tres subdominios.

Comprueba:

```bash
docker compose ps                       # todo "running"
curl https://api.example.com/health     # {"status":"ok"}
```

- Panel del jefe: `https://admin.example.com`
- App del trabajador: `https://app.example.com` (desde el móvil: menú del navegador → "Añadir a pantalla de inicio")

## 6. Actualizar a una nueva versión

```bash
cd partes-de-obra
git pull
docker compose up -d --build
```

Las migraciones se aplican solas al reiniciar la API.

## 7. Backups

Hay dos cosas que salvar: la **base de datos** y los **archivos de media** (`/data/media`, volumen Docker `media`).

### Dump diario de PostgreSQL

```bash
mkdir -p ~/backups
crontab -e
```

Añade (dump a las 03:00, conserva 14 días):

```cron
0 3 * * * cd ~/partes-de-obra && docker compose exec -T db pg_dump -U partes partes_obra | gzip > ~/backups/db-$(date +\%F).sql.gz && find ~/backups -name 'db-*.sql.gz' -mtime +14 -delete
```

### Copia de media con rsync

Desde otra máquina (o hacia un storage box de Hetzner):

```bash
# El volumen "media" vive en /var/lib/docker/volumes/<proyecto>_media/_data
rsync -az --delete root@IP-DEL-VPS:/var/lib/docker/volumes/partes-de-obra_media/_data/ ./backup-media/
```

(Comprueba el nombre exacto del volumen con `docker volume ls`.)

### Restaurar

```bash
# Base de datos
gunzip -c db-2026-06-10.sql.gz | docker compose exec -T db psql -U partes partes_obra
# Media: rsync inverso hacia el volumen
```

## 8. Operación

```bash
docker compose logs -f api      # logs de la API
docker compose restart api      # reiniciar un servicio
docker compose down             # parar todo (los volúmenes persisten)
```

### Firewall (recomendado)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

La base de datos solo escucha en `127.0.0.1` y la API solo es accesible a través de Caddy.

## 9. Problemas frecuentes

- **Caddy no emite certificados**: el DNS aún no propaga o los puertos 80/443 están cerrados. Mira `docker compose logs caddy`.
- **502 en api.**: la API no arrancó (suele ser un error de migración o `.env` incompleto). Mira `docker compose logs api`.
- **Subidas grandes fallan**: el límite es 250 MB por petición (Caddyfile) y 200 MB por vídeo (API).
