-- Aviso de caducidad del certificado digital: una revision al dia.
--
-- Va a las 06:30 UTC, despues de process-recurring-invoices (05:00) para no
-- solaparse. La funcion decide sola a quien avisar y en que tramo (60, 30, 7
-- dias y el vencimiento), y no repite dentro del mismo tramo, asi que
-- ejecutarla a diario no genera correo a diario.
--
-- La clave de servicio se lee del vault, igual que las otras dos tareas.
select cron.unschedule('certificate-expiry-alert-daily')
where exists (select 1 from cron.job where jobname = 'certificate-expiry-alert-daily');

select cron.schedule(
  'certificate-expiry-alert-daily',
  '30 6 * * *',
  $$
  select
    net.http_post(
      url := 'https://umqsjycqypxvhbhmidma.supabase.co/functions/v1/certificate-expiry-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_service_role_key'
        )
      )
    ) as request_id;
  $$
);
