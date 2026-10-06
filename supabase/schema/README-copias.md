# Copias de seguridad de la base de datos

La tarea `.github/workflows/copia-seguridad.yml` hace cada noche (03:17 UTC) un
volcado completo, lo cifra con `BACKUP_PASSPHRASE` y lo guarda 30 días en
GitHub → Actions → «Copia de seguridad diaria» → la ejecución del día → Artifacts.

Incluye la base de datos entera (también `auth.users`). **No** incluye los
ficheros de Storage (logos, certificado digital, ficheros del portal).

## Abrir una copia

```bash
cd ~/Descargas
unzip devfreelancer-AAAA-MM-DD.zip          # GitHub entrega el artefacto en un .zip
gpg -d devfreelancer-AAAA-MM-DD.tar.gz.gpg > copia.tar.gz   # pide la contraseña
mkdir copia && tar -xzf copia.tar.gz -C copia
ls -lh copia                                 # roles.sql, esquema.sql, datos.sql
```

## Restaurar en un proyecto de Supabase NUEVO

Nunca sobre producción. Crear un proyecto vacío, copiar su cadena «Session
pooler» y:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file copia/roles.sql --file copia/esquema.sql \
  --command 'SET session_replication_role = replica' \
  --file copia/datos.sql \
  --dbname "CADENA_DEL_PROYECTO_NUEVO"
```

Es el procedimiento de la guía oficial de Supabase (copia y restauración con la
CLI). `session_replication_role = replica` desactiva los disparadores mientras
se cargan los datos: sin él, el bloqueo fiscal y los demás disparadores
rechazarían filas que ya son correctas.

Después de restaurar hay que volver a crear en el proyecto nuevo los secretos de
las Edge Functions, desplegarlas y volver a programar las tareas de `pg_cron`
(ver `fuera-de-public.sql`).

## Si la tarea falla

GitHub avisa por correo al dueño del repositorio. Causas probables:
- Se cambió la contraseña de la base de datos → actualizar `SUPABASE_DB_URL`.
- Más de 60 días sin actividad en el repositorio → GitHub pausa las tareas
  programadas; se reactivan desde la pestaña Actions.
