# Configuración de CRON Jobs en Supabase

Para activar la generación automática de facturas recurrentes, debes configurar un CRON job en tu proyecto de Supabase que invoque la Edge Function `process-recurring-invoices`.

## Opción 1: SQL Editor (Recomendado)

Ejecuta el siguiente comando en el SQL Editor de Supabase para programar la función para que se ejecute todos los días a las 00:00 UTC:

```sql
select
  cron.schedule(
    'process-recurring-invoices-daily',
    '0 0 * * *',
    $$
    select
      net.http_post(
        url:='https://<tu-project-ref>.supabase.co/functions/v1/process-recurring-invoices',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer <tu-service-role-key>"}'
      ) as request_id;
    $$
  );
```

*Nota: Reemplaza `<tu-project-ref>` y `<tu-service-role-key>` con los valores reales de tu proyecto.*

## Opción 2: CLI

Si prefieres usar la CLI de Supabase, asegúrate de tener instalada la extensión `pg_net` y `pg_cron` en tu base de datos y configura el job manualmente.
