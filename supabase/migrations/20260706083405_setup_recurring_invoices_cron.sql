create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'process-recurring-invoices-daily',
  '0 5 * * *', -- 05:00 UTC = madrugada en España, no interfiere con horario laboral
  $$
  select
    net.http_post(
      url := 'https://umqsjycqypxvhbhmidma.supabase.co/functions/v1/process-recurring-invoices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )
    ) as request_id;
  $$
);
;
