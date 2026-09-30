-- Recordatorios de cobro (30/09/2026).
--
-- Ajustes → Notificaciones tenía el interruptor «Enviar recordatorios de pago
-- automáticos a mis clientes» (profiles.payment_reminders_enabled) y dos
-- plantillas, pero nada los enviaba. Ahora la Edge Function
-- recordatorios-cobro los manda cada mañana (ver _shared/recordatorios-cobro.ts).
--
--   * invoices.recordatorios_activos: se pueden apagar para UNA factura. No
--     está entre las columnas que bloquea enforce_invoice_fiscal_lock, así que
--     también se puede cambiar en facturas con registro Veri*Factu.
--   * recordatorios_cobro_enviados: qué nivel se mandó de cada factura, para
--     no repetir nunca. La clave primaria impide el doble envío aunque la
--     tarea se lanzara dos veces a la vez.

alter table public.invoices add column if not exists recordatorios_activos boolean not null default true;

create table if not exists public.recordatorios_cobro_enviados (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  nivel smallint not null check (nivel in (-3, 3, 15, 30)),
  user_id uuid not null references public.profiles(id) on delete cascade,
  destinatario text,
  enviado_en timestamptz not null default now(),
  primary key (invoice_id, nivel)
);

create index if not exists recordatorios_cobro_enviados_user_idx on public.recordatorios_cobro_enviados (user_id, enviado_en desc);

alter table public.recordatorios_cobro_enviados enable row level security;

-- El usuario ve qué se ha mandado de sus facturas; solo el servidor escribe.
create policy recordatorios_cobro_enviados_leer on public.recordatorios_cobro_enviados
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.recordatorios_cobro_enviados from anon, authenticated;
grant select on public.recordatorios_cobro_enviados to authenticated;

-- Cada día a las 07:30 UTC (09:30 en verano, 08:30 en invierno en España).
select cron.unschedule('recordatorios-cobro-diario')
where exists (select 1 from cron.job where jobname = 'recordatorios-cobro-diario');

select cron.schedule(
  'recordatorios-cobro-diario',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://umqsjycqypxvhbhmidma.supabase.co/functions/v1/recordatorios-cobro',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'
      )
    )
  ) as request_id;
  $$
);
