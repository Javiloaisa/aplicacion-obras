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

> ⚠️ **Si en este VPS ya tienes otro servicio expuesto por un puerto propio** (p. ej. un dashboard en `:8080`), `ufw enable` lo dejará inaccesible salvo que abras ese puerto: `sudo ufw allow 8080/tcp`. Ver §10.

## 9. Problemas frecuentes

- **Caddy no emite certificados**: el DNS aún no propaga o los puertos 80/443 están cerrados. Mira `docker compose logs caddy`.
- **502 en api.**: la API no arrancó (suele ser un error de migración o `.env` incompleto). Mira `docker compose logs api`.
- **Subidas grandes fallan**: el límite es 250 MB por petición (Caddyfile) y 200 MB por vídeo (API).

## 10. Convivencia con otros servicios en el mismo VPS

Este stack puede compartir VPS con otras aplicaciones siempre que no haya choque de puertos. El caso ya probado: un **dashboard Flask (crypto-agent) en `:8080`, lanzado por systemd, con SQLite y sin reverse proxy**.

| Recurso | crypto-agent | partes-de-obra | ¿Choque? |
|---|---|---|---|
| Puertos 80 / 443 | no los usa | Caddy los ocupa | no |
| Puerto de aplicación | Flask en `:8080` | nada en el host (interno, vía Caddy) | no |
| Base de datos | SQLite (`trades.db`) | PostgreSQL en `127.0.0.1:5432` | no |
| Runtime | systemd + `python3` | Docker Compose (red y volúmenes aislados) | no |

Pasos y precauciones:

1. **Docker**: crypto-agent no lo usa, así que probablemente no esté instalado. Instálalo (§3); no toca el servicio de crypto.
2. **Firewall**: si activas `ufw`, recuerda `sudo ufw allow 8080/tcp` o el dashboard de crypto quedará inaccesible (§8). Comprueba el estado antes con `sudo ufw status`.
3. **Recursos**: verifica margen con `free -h` (este stack pide ~0.5–1 GB) y `df -h` (las fotos/vídeos crecen en disco; ≥40 GB recomendado).
4. **Volúmenes Docker aislados**: Compose nombra los volúmenes y la red con el prefijo del directorio del proyecto (`partes-de-obra_*`), así que no interfieren con nada de crypto.

### (Opcional) Servir el dashboard de crypto por HTTPS con el mismo Caddy

Como Caddy ya gestiona 80/443 y los certificados, puedes exponer el dashboard de crypto en un cuarto subdominio con HTTPS automático en lugar de `http://IP:8080`. Añade al `Caddyfile`:

```caddy
crypto.{$DOMAIN} {
	encode gzip
	reverse_proxy host.docker.internal:8080
}
```

Requiere un registro DNS `A` para `crypto.` y, en `docker-compose.yml`, dar a `caddy` acceso al host:

```yaml
  caddy:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Así podrías incluso cerrar el `:8080` en el firewall y dejar el dashboard solo accesible por HTTPS. Es opcional: la convivencia funciona igual sin esto.

### Si otro stack Docker ya ocupa los puertos 80/443 (caso real: estudio-pisada)

Si el VPS ya tiene un Caddy/nginx en Docker sirviendo `http://IP` en el 80 (sin dominio propio), el Caddy de partes-de-obra pasa a ser el único en 80/443 y reenvía el tráfico por IP al otro stack:

1. En el compose del otro proyecto, ata su proxy a la **IP del bridge de Docker**
   (la que `host.docker.internal` resuelve dentro del Caddy de partes-de-obra,
   normalmente `172.17.0.1`), no a `127.0.0.1`:
   ```yaml
   ports:
     - "172.17.0.1:8081:80"   # antes "80:80" y "443:443"
   ```
   y recrea solo ese servicio: `docker compose up -d caddy`.

   > ⚠️ **No uses `127.0.0.1:8081:80`**: el Caddy de partes-de-obra alcanza al otro
   > stack vía `host.docker.internal`, que apunta a la puerta de enlace del bridge
   > (p. ej. `172.17.0.1`), **no** a `127.0.0.1`. Si lo atas solo al loopback,
   > `http://IP` devolverá **502**. Comprueba la IP correcta con:
   > `docker exec partes-de-obra-caddy-1 getent hosts host.docker.internal`.
   > Atarlo a `172.17.0.1` lo mantiene accesible solo desde Docker (no se expone a internet).
2. En el `.env` de partes-de-obra define `LEGACY_IP_HOST=<IP-del-VPS>`.
3. Arranca partes-de-obra. El bloque `http://{$LEGACY_IP_HOST}` del Caddyfile reenvía `http://IP` → `host.docker.internal:8081`, así la app antigua sigue respondiendo en su URL de siempre.

Nota: la BD de este proyecto ya no publica el puerto 5432 en el host (en este VPS hay un PostgreSQL nativo escuchando ahí). Para una consola psql: `docker compose exec db psql -U partes partes_obra`.
