-- Comprobación de la revisión de seguridad del 27/09: límites de clientes y de
-- equipo, fecha de invitación al portal, email del perfil, referencias a
-- clientes/proyectos ajenos y cupos de envío.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/revision-seguridad-funciones.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea usuarios de prueba y termina siempre con una
-- excepción a propósito que deshace la transacción entera. Lee el texto.

do $$
declare
  v_free  uuid := gen_random_uuid();   -- cuenta Free
  v_teams uuid := gen_random_uuid();   -- dueña de un equipo
  v_otra  uuid := gen_random_uuid();   -- otra freelancer (víctima)
  v_cli_free  uuid;
  v_cli_otra  uuid;
  v_proy_otra uuid;
  v_tm    uuid;
  v_txt   text;
  v_b     boolean;
  v_i     int;
  v_res   text := '';
  v_f     int := 0;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at) values
    (v_free,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'free-'  || v_free  || '@ejemplo.com', '{"full_name":"Free"}',  now()),
    (v_teams, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'teams-' || v_teams || '@ejemplo.com', '{"full_name":"Teams"}', now()),
    (v_otra,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otra-'  || v_otra  || '@ejemplo.com', '{"full_name":"Otra"}',  now());
  update public.profiles set plan = 'Teams' where id = v_teams;

  -- Datos de la víctima (como postgres).
  insert into public.clients (user_id, name, email) values (v_otra, 'Cliente de otra', 'c@otra.com') returning id into v_cli_otra;
  insert into public.projects (user_id, name, client_id, status) values (v_otra, 'Proyecto de otra', v_cli_otra, 'in-progress') returning id into v_proy_otra;

  ---------------------------------------------------------------- Free
  perform set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated', 'email', 'free-' || v_free || '@ejemplo.com')::text, true);
  execute 'set local role authenticated';

  insert into public.clients (user_id, name, email, portal_invitado_en)
  values (v_free, 'Mi cliente', 'mio@ejemplo.com', '2000-01-01') returning id into v_cli_free;
  begin
    insert into public.clients (user_id, name, email) values (v_free, 'Segundo', 'dos@ejemplo.com');
    v_res := v_res || E'\n  FALLA 1) Free puede crear un segundo cliente'; v_f := v_f + 1;
  exception when raise_exception then
    v_res := v_res || E'\n  OK    1) Free: segundo cliente rechazado';
  end;

  select (portal_invitado_en is null) into v_b from public.clients where id = v_cli_free;
  begin
    update public.clients set portal_invitado_en = null where id = v_cli_free;
    update public.clients set portal_invitado_en = now() where id = v_cli_free;
    v_res := v_res || E'\n  FALLA 2) el navegador cambia portal_invitado_en'; v_f := v_f + 1;
  exception when insufficient_privilege then
    if v_b then v_res := v_res || E'\n  OK    2) portal_invitado_en: nace vacío y no se puede tocar';
    else v_res := v_res || E'\n  FALLA 2) portal_invitado_en no nace vacío'; v_f := v_f + 1; end if;
  end;

  begin
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, total_cents)
    values (v_free, v_cli_otra, 'X-1', current_date, current_date, '[]', 100, 100);
    v_res := v_res || E'\n  FALLA 3) factura con el cliente de otra'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    3) factura apuntando al cliente de otra: rechazada';
  end;

  begin
    insert into public.time_entries (user_id, project_id, description, start_time, end_time, duration_seconds)
    values (v_free, v_proy_otra, 'x', now(), now(), 3600);
    v_res := v_res || E'\n  FALLA 4) horas en el proyecto de otra'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    4) horas en el proyecto de otra: rechazadas';
  end;

  begin
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, total_cents)
    values (v_free, v_cli_free, 'X-2', current_date, current_date, '[]', 100, 100);
    v_res := v_res || E'\n  OK    5) factura con su propio cliente: permitida';
  exception when others then
    v_res := v_res || E'\n  FALLA 5) su propia factura: ' || sqlerrm; v_f := v_f + 1;
  end;

  begin
    insert into public.team_members (user_id, name, email, role, status) values (v_free, 'X', 'x@ejemplo.com', 'Developer', 'Pendiente');
    v_res := v_res || E'\n  FALLA 6) Free añade miembros de equipo'; v_f := v_f + 1;
  exception when raise_exception then
    v_res := v_res || E'\n  OK    6) Free: sin miembros de equipo';
  end;

  -- Perfil borrado y recreado con un email falso.
  delete from public.profiles where id = v_free;
  insert into public.profiles (id, email, full_name) values (v_free, 'agencia@hacienda.gob.es', 'Free');
  execute 'reset role';
  select email into v_txt from public.profiles where id = v_free;
  if v_txt = 'free-' || v_free || '@ejemplo.com' then
    v_res := v_res || E'\n  OK    7) perfil recreado: el email es siempre el de la cuenta';
  else
    v_res := v_res || E'\n  FALLA 7) perfil recreado con email ' || coalesce(v_txt, 'null'); v_f := v_f + 1;
  end if;

  ---------------------------------------------------------------- Teams
  perform set_config('request.jwt.claims', json_build_object('sub', v_teams, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.team_members (user_id, name, email, role, status, accepted_user_id)
  values (v_teams, 'Ana', 'ana@ejemplo.com', 'Developer', 'Activo', v_otra) returning id into v_tm;
  select status || '/' || coalesce(accepted_user_id::text, 'null') into v_txt from public.team_members where id = v_tm;
  if v_txt = 'Pendiente/null' then
    v_res := v_res || E'\n  OK    8) alta de miembro: nace pendiente y sin aceptar';
  else
    v_res := v_res || E'\n  FALLA 8) alta de miembro: ' || v_txt; v_f := v_f + 1;
  end if;

  begin
    update public.team_members set accepted_user_id = v_otra where id = v_tm;
    v_res := v_res || E'\n  FALLA 9) el dueño engancha a alguien a mano'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    9) enganchar a alguien a mano: rechazado';
  end;

  begin
    update public.team_members set status = 'Activo' where id = v_tm;
    v_res := v_res || E'\n  FALLA 10) activar sin aceptar'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK   10) activar sin que acepte: rechazado';
  end;

  for v_i in 2..5 loop
    insert into public.team_members (user_id, name, email, role, status) values (v_teams, 'M' || v_i, 'm' || v_i || '@ejemplo.com', 'Developer', 'Pendiente');
  end loop;
  begin
    insert into public.team_members (user_id, name, email, role, status) values (v_teams, 'M6', 'm6@ejemplo.com', 'Developer', 'Pendiente');
    v_res := v_res || E'\n  FALLA 11) Teams pasa de 5 miembros'; v_f := v_f + 1;
  exception when raise_exception then
    v_res := v_res || E'\n  OK   11) Teams: el sexto miembro se rechaza';
  end;
  execute 'reset role';

  ---------------------------------------------------------------- cupos
  perform set_config('request.jwt.claims', json_build_object('sub', v_teams, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.reservar_invitacion_portal(v_teams, null, 'x@ejemplo.com');
    v_res := v_res || E'\n  FALLA 12) el navegador usa el cupo del portal'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK   12) cupos: solo el servidor';
  end;
  execute 'reset role';

  execute 'set local role service_role';
  select public.reservar_invitacion_portal(v_teams, null, 'Cliente@Ejemplo.com') into v_txt;
  if v_txt is not null then v_res := v_res || E'\n  FALLA 13) primera invitación rechazada: ' || v_txt; v_f := v_f + 1; end if;
  select public.reservar_invitacion_portal(v_teams, null, 'cliente@ejemplo.com') into v_txt;
  if v_txt is null then v_res := v_res || E'\n  FALLA 13) se reinvita al momento'; v_f := v_f + 1;
  else v_res := v_res || E'\n  OK   13) portal: no se reinvita la misma dirección en 10 minutos'; end if;

  select public.reservar_envio_documento(v_teams, 'factura', null, 'a@ejemplo.com', 2) into v_b;
  select public.reservar_envio_documento(v_teams, 'factura', null, 'a@ejemplo.com', 2) into v_b;
  select public.reservar_envio_documento(v_teams, 'factura', null, 'a@ejemplo.com', 2) into v_b;
  execute 'reset role';
  if not v_b then v_res := v_res || E'\n  OK   14) documentos: el cupo diario corta';
  else v_res := v_res || E'\n  FALLA 14) documentos: el cupo no corta'; v_f := v_f + 1; end if;

  raise exception E'REVISIÓN DE SEGURIDAD — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
