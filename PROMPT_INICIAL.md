# PROMPT_INICIAL.md — Qué decirle a Claude Code

## Preparación

1. Crea una carpeta para el proyecto (ej. `partes-obra`) y copia dentro `CLAUDE.md` y `ESPECIFICACION.md`.
2. `git init` (y si quieres, repo privado en GitHub conectado).
3. Abre Claude Code en esa carpeta.

## Prompt inicial (cópialo tal cual)

```
Lee CLAUDE.md y ESPECIFICACION.md por completo antes de hacer nada.

El proyecto son DOS aplicaciones separadas (app-trabajador PWA y panel-admin)
sobre una API común, en un monorepo. Vamos a construirlo siguiendo el
"Orden de trabajo recomendado" del CLAUDE.md, fase por fase.

Empieza por la Fase 1 (esqueleto del monorepo, docker-compose.yml, Caddyfile
con los tres subdominios, .env.example) y la Fase 2 (modelos SQLAlchemy,
migración inicial de Alembic, auth JWT con login/refresh/change-password,
rechazo de workers en el login del panel, y seed del admin desde el .env).

Al terminar estas dos fases:
1. Dame instrucciones exactas para levantar el entorno en local y probarlo.
2. Haz commit con mensaje convencional.
3. Espera mi confirmación antes de pasar a la Fase 3.

Si algo de la especificación es ambiguo, pregúntame antes de decidir por tu cuenta.
```

## Prompts para las fases siguientes

```
Fase 3: implementa los routers de obras, partes de trabajo (work_entries) y
media según la sección 4 de ESPECIFICACION.md: subida multipart con validación
por magic bytes, miniaturas con BackgroundTasks, descarga autenticada con
soporte de Range para vídeo. Tests de permisos (worker no accede a obras no
asignadas ni a partes ajenos) y de validación de archivos. Commit y espera.
```

```
Fase 4: endpoints de informes y exportación CSV de horas (sección 4,
"Informes"). Tests del agregado y de los límites de horas. Commit y espera.
```

```
Fase 5: app-trabajador (React+Vite+TS+Tailwind, SIN shadcn): login con cambio
de contraseña obligatorio, Mis Obras, pantalla de Obra con los 3 botones
grandes (parte de horas, subir fotos/vídeos con cámara y compresión en
cliente, mi actividad) e Historial, según la sección 5. Mobile-first,
conectada a la API real. Commit y espera.
```

```
Fase 6: convierte app-trabajador en PWA instalable: manifest, service worker
con vite-plugin-pwa y la cola offline de subidas con IndexedDB de la sección 5.
Explícame cómo probar el modo offline con Chrome DevTools y cómo instalarla
en Android y en iPhone. Commit y espera.
```

```
Fase 7: panel-admin (React+Vite+TS+Tailwind+shadcn/ui): login solo-admin,
dashboard, obras con detalle (pestañas Galería con lightbox y vídeo, Horas
con edición y export CSV, Trabajadores), Informes y Usuarios, según la
sección 6. Commit por bloque y espera al final.
```

```
Fase 8: Caddyfile definitivo con los tres subdominios y DEPLOY.md con los
pasos completos para mi VPS de Hetzner (Ubuntu + Docker), DNS necesario,
y estrategia de backup de Postgres y /data/media.
```

## Consejos

- Ve fase a fase y prueba cada una antes de continuar; corregir pronto es barato.
- Cuando algo falle, pégale a Claude Code el error completo (traceback de la API o consola del navegador).
- Necesitarás 3 registros DNS tipo A apuntando al VPS: `app`, `admin` y `api` de tu dominio. Decídelo antes de la Fase 8.
- El admin inicial se crea con `ADMIN_USERNAME`/`ADMIN_PASSWORD` del `.env`; cambia la contraseña tras el primer login.
- Para probar la PWA en el móvil durante el desarrollo, puedes usar `npm run dev -- --host` y entrar desde el móvil por la IP local, aunque el service worker completo solo funciona bajo HTTPS (pruébalo ya desplegado o con `vite preview`).
