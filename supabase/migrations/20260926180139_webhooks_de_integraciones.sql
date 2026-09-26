-- Webhooks de verdad para las integraciones (plan Teams).
--
-- La página de precios vende "Integraciones con Slack y Webhooks" en Teams.
-- La pantalla /integrations guardaba las URLs en public.integrations, pero
-- NADA las leía nunca: ningún disparador, ninguna función. Nadie ha recibido
-- jamás un webhook. El botón "Probar" hacía un fetch sin cuerpo en modo
-- no-cors, que da "éxito" contra casi cualquier dirección.
--
-- Ahora, tres eventos disparan un POST a las integraciones activas del dueño:
--   TASK_COMPLETED       una tarea pasa a completada
--   NEW_DOCUMENT         se crea una factura, presupuesto, propuesta o contrato
--   TIMESHEET_SUBMITTED  se registran horas
--
-- Cómo se envía: pg_net (net.http_post), asíncrono. El INSERT/UPDATE del
-- usuario no espera a la respuesta ni falla si el destino falla: un Slack caído
-- no puede impedir crear una factura. El cuerpo lleva "text" (lo que pinta un
-- webhook entrante de Slack tal cual) y además "event", "occurred_at" y
-- "data" para Zapier, Make o un servidor propio.
--
-- SEGURIDAD — quien hace la petición es el servidor de la base de datos, hacia
-- una dirección que escribe el usuario. Sin control, se podría apuntar a
-- direcciones internas (169.254.169.254, localhost, *.internal…). Solo se
-- aceptan https:// con un nombre de dominio público: ni IPs, ni localhost, ni
-- dominios de red interna. Se comprueba al guardar Y al enviar.

-- 1) Qué direcciones se aceptan -----------------------------------------------

create or replace function public.url_de_webhook_valida(p_url text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_host text;
begin
  if p_url is null or length(p_url) > 2048 or p_url !~* '^https://' then
    return false;
  end if;
  -- Nada de usuario:contraseña@ en la URL (sirve para disfrazar el destino).
  v_host := lower(substring(p_url from '^https://([^/?#]+)'));
  if v_host is null or v_host like '%@%' then
    return false;
  end if;
  v_host := regexp_replace(v_host, ':\d+$', '');           -- sin puerto
  if v_host like '[%'                                        -- IPv6 literal
     or v_host ~ '^[0-9.]+$'                                 -- IPv4 literal
     or v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     or v_host = 'localhost'
     or v_host ~ '\.(localhost|local|internal|intranet|lan|home|corp|localdomain)$'
  then
    return false;
  end if;
  return true;
end;
$$;

-- NOT VALID: las filas que ya existen no se revisan al añadirla (dos, ambas
-- https con dominio público); todas las nuevas y todos los cambios, sí.
alter table public.integrations
  drop constraint if exists integrations_url_segura;
alter table public.integrations
  add constraint integrations_url_segura check (public.url_de_webhook_valida(url)) not valid;

alter table public.integrations
  drop constraint if exists integrations_evento_conocido;
alter table public.integrations
  add constraint integrations_evento_conocido
  check (event in ('TASK_COMPLETED', 'NEW_DOCUMENT', 'TIMESHEET_SUBMITTED')) not valid;

-- 2) Registro de envíos ---------------------------------------------------------

create table if not exists public.webhooks_enviados (
  id             bigint generated always as identity primary key,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  user_id        uuid not null,
  event          text not null,
  request_id     bigint,           -- id de pg_net: net._http_response guarda la respuesta unas horas
  es_prueba      boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists webhooks_enviados_integracion_idx
  on public.webhooks_enviados (integration_id, created_at desc);

alter table public.webhooks_enviados enable row level security;

drop policy if exists webhooks_enviados_select_own on public.webhooks_enviados;
create policy webhooks_enviados_select_own on public.webhooks_enviados
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- Sin políticas de escritura: solo escriben las funciones del servidor.

alter table public.integrations
  add column if not exists last_sent_at timestamptz;

-- 3) El envío -------------------------------------------------------------------

create or replace function public.enviar_webhooks(
  p_dueno  uuid,
  p_evento text,
  p_texto  text,
  p_datos  jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_int  record;
  v_req  bigint;
  v_n    integer := 0;
begin
  -- Solo cuentas Teams con la suscripción viva: es lo que se vende.
  if not exists (
    select 1 from public.profiles
     where id = p_dueno
       and plan = 'Teams'
       and coalesce(subscription_status, '') in ('active', 'trialing')
  ) then
    return 0;
  end if;

  for v_int in
    select id, url
      from public.integrations
     where user_id = p_dueno
       and is_active
       and event = p_evento
  loop
    if not public.url_de_webhook_valida(v_int.url) then
      continue;
    end if;

    v_req := net.http_post(
      url := v_int.url,
      body := jsonb_build_object(
        'text',        p_texto,
        'event',       p_evento,
        'occurred_at', now(),
        'data',        coalesce(p_datos, '{}'::jsonb),
        'source',      'devfreelancer.app'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'User-Agent',   'DevFreelancer-Webhooks/1.0'
      ),
      timeout_milliseconds := 5000
    );

    insert into public.webhooks_enviados (integration_id, user_id, event, request_id)
    values (v_int.id, p_dueno, p_evento, v_req);

    update public.integrations set last_sent_at = now() where id = v_int.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.enviar_webhooks(uuid, text, text, jsonb) from public, anon, authenticated;

-- Envoltorio para los disparadores: un fallo al enviar (pg_net, una URL rara)
-- nunca puede tumbar el INSERT/UPDATE del usuario.
create or replace function public.enviar_webhooks_sin_fallar(
  p_dueno uuid, p_evento text, p_texto text, p_datos jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.enviar_webhooks(p_dueno, p_evento, p_texto, p_datos);
exception when others then
  raise warning 'webhooks: no se pudo enviar % de %: %', p_evento, p_dueno, sqlerrm;
end;
$$;

revoke all on function public.enviar_webhooks_sin_fallar(uuid, text, text, jsonb) from public, anon, authenticated;

-- 4) Los eventos ----------------------------------------------------------------

-- TASK_COMPLETED
create or replace function public.webhook_tarea_completada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto text;
begin
  if new.status::text in ('completed', 'done')
     and (tg_op = 'INSERT' or old.status::text not in ('completed', 'done')) then
    select name into v_proyecto from public.projects where id = new.project_id;
    perform public.enviar_webhooks_sin_fallar(
      new.user_id,
      'TASK_COMPLETED',
      format('✅ Tarea completada: %s%s', new.description,
             coalesce(' — ' || v_proyecto, '')),
      jsonb_build_object('task_id', new.id, 'description', new.description,
                         'project_id', new.project_id, 'project_name', v_proyecto)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_webhook_completada on public.tasks;
create trigger tasks_webhook_completada
  after insert or update of status on public.tasks
  for each row execute function public.webhook_tarea_completada();

-- NEW_DOCUMENT (facturas, presupuestos, propuestas, contratos)
create or replace function public.webhook_documento_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente text;
  v_tipo    text;
  v_titulo  text;
  v_importe bigint;
  v_fila    jsonb := to_jsonb(new);
begin
  select coalesce(company, name) into v_cliente
    from public.clients where id = (v_fila->>'client_id')::uuid;

  case tg_table_name
    when 'invoices' then
      v_tipo := 'Factura';
      v_titulo := v_fila->>'invoice_number';
      v_importe := (v_fila->>'total_cents')::bigint;
    when 'budgets' then
      v_tipo := 'Presupuesto';
      v_titulo := v_fila->>'description';
      v_importe := (v_fila->>'amount_cents')::bigint;
    when 'proposals' then
      v_tipo := 'Propuesta';
      v_titulo := v_fila->>'title';
      v_importe := (v_fila->>'amount_cents')::bigint;
    when 'contracts' then
      v_tipo := 'Contrato';
      v_titulo := null;
      v_importe := null;
  end case;

  perform public.enviar_webhooks_sin_fallar(
    (v_fila->>'user_id')::uuid,
    'NEW_DOCUMENT',
    format('📄 %s nuevo%s%s%s', v_tipo,
           coalesce(': ' || v_titulo, ''),
           coalesce(' para ' || v_cliente, ''),
           coalesce(' — ' || replace(to_char(v_importe / 100.0, 'FM999999990.00'), '.', ',') || ' €', '')),
    jsonb_build_object('document_type', tg_table_name, 'document_id', v_fila->>'id',
                       'title', v_titulo, 'client_name', v_cliente, 'amount_cents', v_importe)
  );
  return new;
end;
$$;

drop trigger if exists invoices_webhook_documento on public.invoices;
create trigger invoices_webhook_documento after insert on public.invoices
  for each row execute function public.webhook_documento_nuevo();
drop trigger if exists budgets_webhook_documento on public.budgets;
create trigger budgets_webhook_documento after insert on public.budgets
  for each row execute function public.webhook_documento_nuevo();
drop trigger if exists proposals_webhook_documento on public.proposals;
create trigger proposals_webhook_documento after insert on public.proposals
  for each row execute function public.webhook_documento_nuevo();
drop trigger if exists contracts_webhook_documento on public.contracts;
create trigger contracts_webhook_documento after insert on public.contracts
  for each row execute function public.webhook_documento_nuevo();

-- TIMESHEET_SUBMITTED
create or replace function public.webhook_horas_registradas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto text;
  v_horas    numeric := round(coalesce(new.duration_seconds, 0) / 3600.0, 2);
begin
  select name into v_proyecto from public.projects where id = new.project_id;
  perform public.enviar_webhooks_sin_fallar(
    new.user_id,
    'TIMESHEET_SUBMITTED',
    format('⏱️ %s h registradas%s%s', replace(v_horas::text, '.', ','),
           coalesce(' en ' || v_proyecto, ''),
           coalesce(': ' || nullif(new.description, ''), '')),
    jsonb_build_object('time_entry_id', new.id, 'project_id', new.project_id,
                       'project_name', v_proyecto, 'hours', v_horas,
                       'description', new.description, 'logged_by', new.logged_by)
  );
  return new;
end;
$$;

drop trigger if exists time_entries_webhook_horas on public.time_entries;
create trigger time_entries_webhook_horas after insert on public.time_entries
  for each row execute function public.webhook_horas_registradas();

revoke all on function public.webhook_tarea_completada() from public, anon, authenticated;
revoke all on function public.webhook_documento_nuevo() from public, anon, authenticated;
revoke all on function public.webhook_horas_registradas() from public, anon, authenticated;

-- 5) Botón "Probar" de verdad ---------------------------------------------------
-- Envía un mensaje de prueba real y devuelve el id de la petición; con
-- resultado_prueba_webhook() la pantalla consulta qué respondió el destino.

create or replace function public.probar_webhook(p_integration uuid)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_int record;
  v_req bigint;
  v_recientes int;
begin
  select id, user_id, url, event into v_int
    from public.integrations
   where id = p_integration and user_id = auth.uid();
  if not found then
    raise exception 'Integración no encontrada' using errcode = '42501';
  end if;
  if not public.url_de_webhook_valida(v_int.url) then
    raise exception 'La dirección debe ser https:// y de un dominio público.' using errcode = '22023';
  end if;

  -- Tope: 10 pruebas por hora y cuenta. Es una petición saliente desde
  -- nuestro servidor; sin tope, el botón sirve para bombardear una URL.
  select count(*) into v_recientes
    from public.webhooks_enviados
   where user_id = auth.uid() and es_prueba and created_at > now() - interval '1 hour';
  if v_recientes >= 10 then
    raise exception 'Demasiadas pruebas. Espera un rato.' using errcode = '54000';
  end if;

  v_req := net.http_post(
    url := v_int.url,
    body := jsonb_build_object(
      'text', '🔔 Prueba de DevFreelancer: la integración funciona.',
      'event', v_int.event, 'occurred_at', now(), 'test', true,
      'data', '{}'::jsonb, 'source', 'devfreelancer.app'
    ),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'User-Agent', 'DevFreelancer-Webhooks/1.0'),
    timeout_milliseconds := 5000
  );

  insert into public.webhooks_enviados (integration_id, user_id, event, request_id, es_prueba)
  values (v_int.id, v_int.user_id, v_int.event, v_req, true);

  return v_req;
end;
$$;

revoke all on function public.probar_webhook(uuid) from public, anon;
grant execute on function public.probar_webhook(uuid) to authenticated;

-- Qué respondió el destino. NULL mientras no ha contestado.
create or replace function public.resultado_prueba_webhook(p_request_id bigint)
returns table (status_code integer, error text)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not exists (select 1 from public.webhooks_enviados
                  where request_id = p_request_id and user_id = auth.uid()) then
    return;
  end if;
  return query
    select r.status_code, r.error_msg
      from net._http_response r
     where r.id = p_request_id;
end;
$$;

revoke all on function public.resultado_prueba_webhook(bigint) from public, anon;
grant execute on function public.resultado_prueba_webhook(bigint) to authenticated;
