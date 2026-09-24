select
  cron.schedule(
    'weekly-profitability-alert-monday',
    '0 7 * * 1',  -- todos los lunes a las 07:00 UTC
    $$
    select
      net.http_post(
        url := 'https://umqsjycqypxvhbhmidma.supabase.co/functions/v1/weekly-profitability-alert',
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
  );;
