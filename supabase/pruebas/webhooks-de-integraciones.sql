-- Comprobación de los webhooks de las integraciones (plan Teams).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/webhooks-de-integraciones.sql
--
-- ES SEGURO EN PRODUCCIÓN, Y NO ENVÍA NADA: pg_net guarda las peticiones en
-- una cola dentro de la misma transacción, y la prueba termina siempre con
-- una excepción a propósito que la deshace entera. La cola se vacía y ninguna
-- petición llega a salir, ni siquiera a las integraciones de verdad. El
-- resultado aparece como un mensaje de error: eso es lo normal.

do $$
declare
  v_dueno uuid; v_cli uuid; v_proy uuid; v_tarea uuid; v_otra uuid;
  v_res text := ''; v_f int := 0; v_n0 int; v_n1 int; v_txt text; v_req bigint;
begin
  -- Un dueño con cliente y proyecto, en Teams activo (forzado dentro de la transacción).
  select c.user_id, c.id, p.id into v_dueno, v_cli, v_proy
    from public.clients c join public.projects p on p.user_id = c.user_id limit 1;
  if v_dueno is null then raise exception 'No hay datos con los que probar.'; end if;
  update public.profiles set plan = 'Teams', subscription_status = 'active' where id = v_dueno;

  -- 1) Direcciones
  if public.url_de_webhook_valida('https://hooks.slack.com/services/T0/B0/xyz')
     and public.url_de_webhook_valida('https://example.com:8443/hook?a=1')
     and not public.url_de_webhook_valida('http://example.com/hook')
     and not public.url_de_webhook_valida('https://169.254.169.254/latest/meta-data')
     and not public.url_de_webhook_valida('https://localhost/x')
     and not public.url_de_webhook_valida('https://127.0.0.1:5432/')
     and not public.url_de_webhook_valida('https://user:pw@evil.com/')
     and not public.url_de_webhook_valida('https://db.internal/x')
     and not public.url_de_webhook_valida('https://[::1]/x')
     and not public.url_de_webhook_valida('https://intranet/x')
  then v_res := v_res || E'\n  OK    1) direcciones: https publicas si; IPs, localhost, internas y credenciales no';
  else v_res := v_res || E'\n  FALLA 1) validacion de direcciones'; v_f := v_f + 1; end if;

  -- 2) Guardar una direccion interna
  begin
    insert into public.integrations (user_id, name, url, event) values (v_dueno, 'mala', 'https://169.254.169.254/', 'NEW_DOCUMENT');
    v_res := v_res || E'\n  FALLA 2) se guardo una direccion interna'; v_f := v_f + 1;
  exception when check_violation then
    v_res := v_res || E'\n  OK    2) una direccion interna no se puede guardar';
  end;

  insert into public.integrations (user_id, name, url, event) values
    (v_dueno, 'prueba tareas', 'https://example.com/tareas', 'TASK_COMPLETED'),
    (v_dueno, 'prueba horas',  'https://example.com/horas',  'TIMESHEET_SUBMITTED'),
    (v_dueno, 'prueba docs',   'https://example.com/docs',   'NEW_DOCUMENT');

  -- 3) Documento nuevo: una peticion por integracion NEW_DOCUMENT activa
  select count(*) into v_n0 from public.webhooks_enviados;
  insert into public.budgets (user_id, client_id, description, amount_cents) values (v_dueno, v_cli, 'Web corporativa', 181500);
  select count(*) into v_n1 from public.webhooks_enviados;
  select convert_from(q.body, 'utf8')::jsonb->>'text' into v_txt
    from net.http_request_queue q where q.url = 'https://example.com/docs' order by id desc limit 1;
  if v_n1 - v_n0 = (select count(*) from public.integrations where user_id = v_dueno and is_active and event = 'NEW_DOCUMENT')
     and v_txt like '📄 Presupuesto nuevo: Web corporativa para % — 1815,00 €' then
    v_res := v_res || format(E'\n  OK    3) documento nuevo: %s envio(s) — "%s"', v_n1 - v_n0, v_txt);
  else v_res := v_res || format(E'\n  FALLA 3) envios %s, texto %s', v_n1 - v_n0, v_txt); v_f := v_f + 1; end if;

  -- 4) Tarea completada: solo al pasar a completada, una vez
  insert into public.tasks (user_id, project_id, description, status) values (v_dueno, v_proy, 'Revisar diseño', 'todo') returning id into v_tarea;
  select count(*) into v_n0 from public.webhooks_enviados where event = 'TASK_COMPLETED';
  update public.tasks set status = 'completed' where id = v_tarea;
  update public.tasks set status = 'done' where id = v_tarea;
  select count(*) into v_n1 from public.webhooks_enviados where event = 'TASK_COMPLETED';
  select convert_from(q.body, 'utf8')::jsonb->>'text' into v_txt
    from net.http_request_queue q where q.url = 'https://example.com/tareas' order by id desc limit 1;
  if v_n1 - v_n0 = 1 and v_txt like '✅ Tarea completada: Revisar diseño%' then
    v_res := v_res || format(E'\n  OK    4) tarea completada: 1 envio, no se repite al pasar a done — "%s"', v_txt);
  else v_res := v_res || format(E'\n  FALLA 4) envios %s, texto %s', v_n1 - v_n0, v_txt); v_f := v_f + 1; end if;

  -- 5) Horas registradas
  select count(*) into v_n0 from public.webhooks_enviados where event = 'TIMESHEET_SUBMITTED';
  insert into public.time_entries (user_id, project_id, description, start_time, end_time, duration_seconds, logged_by)
  values (v_dueno, v_proy, 'Maquetacion', now() - interval '150 minutes', now(), 9000, v_dueno);
  select count(*) into v_n1 from public.webhooks_enviados where event = 'TIMESHEET_SUBMITTED';
  select convert_from(q.body, 'utf8')::jsonb->>'text' into v_txt
    from net.http_request_queue q where q.url = 'https://example.com/horas' order by id desc limit 1;
  if v_n1 - v_n0 = 1 and v_txt like '⏱️ 2,50 h registradas en %: Maquetacion' then
    v_res := v_res || format(E'\n  OK    5) horas registradas — "%s"', v_txt);
  else v_res := v_res || format(E'\n  FALLA 5) envios %s, texto %s', v_n1 - v_n0, v_txt); v_f := v_f + 1; end if;

  -- 6) Boton Probar: la propia si, una ajena no
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ajeno-' || gen_random_uuid() || '@ejemplo.com')
  returning id into v_otra;
  insert into public.integrations (user_id, name, url, event) values (v_otra, 'ajena', 'https://example.com/ajena', 'NEW_DOCUMENT')
  returning id into v_otra;
  perform set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_req := public.probar_webhook((select id from public.integrations where user_id = v_dueno and name = 'prueba docs'));
  begin
    perform public.probar_webhook(v_otra);
    v_res := v_res || E'\n  FALLA 6) se pudo probar una integracion ajena'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || format(E'\n  OK    6) probar: la propia si (peticion %s), una ajena no', v_req);
  end;
  execute 'reset role';

  -- 7) Sin Teams activo no se envia nada
  update public.profiles set plan = 'Pro' where id = v_dueno;
  select count(*) into v_n0 from public.webhooks_enviados;
  insert into public.budgets (user_id, client_id, description, amount_cents) values (v_dueno, v_cli, 'Otro', 100);
  select count(*) into v_n1 from public.webhooks_enviados;
  if v_n1 = v_n0 then v_res := v_res || E'\n  OK    7) sin plan Teams activo no se envia nada';
  else v_res := v_res || E'\n  FALLA 7) se envio sin Teams'; v_f := v_f + 1; end if;

  raise exception E'WEBHOOKS DE INTEGRACIONES — % fallo(s)\n%\n\n(la transaccion se ha deshecho: ninguna peticion ha salido)', v_f, v_res;
end $$;
