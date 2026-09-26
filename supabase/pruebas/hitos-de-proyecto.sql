-- Comprobación de los hitos de proyecto.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/hitos-de-proyecto.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea cuentas y filas de prueba (un Manager, un
-- Developer, un cliente del portal y un extraño) y termina siempre con una
-- excepción a propósito, que deshace la transacción entera. El resultado
-- aparece como un mensaje de error: eso es lo normal.

do $$
declare
  v_dueno uuid; v_proy uuid; v_cli uuid; v_proy_ajeno uuid;
  v_man uuid := gen_random_uuid(); v_dev uuid := gen_random_uuid();
  v_por uuid := gen_random_uuid(); v_ext uuid := gen_random_uuid();
  v_h uuid; v_res text := ''; v_f int := 0; v_n int; v_m int; v_uid uuid;
begin
  select p.user_id, p.id, p.client_id into v_dueno, v_proy, v_cli
    from public.projects p where p.client_id is not null limit 1;
  select p.id into v_proy_ajeno from public.projects p where p.user_id <> v_dueno limit 1;
  if v_proy is null or v_proy_ajeno is null then
    raise exception 'Hacen falta proyectos de al menos dos cuentas para probar.';
  end if;

  insert into auth.users (id, instance_id, aud, role, email) values
    (v_man, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'man-' || v_man || '@ejemplo.com'),
    (v_dev, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-' || v_dev || '@ejemplo.com'),
    (v_por, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'por-' || v_por || '@ejemplo.com'),
    (v_ext, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ext-' || v_ext || '@ejemplo.com');
  insert into public.team_members (user_id, name, email, role, status, accepted_user_id) values
    (v_dueno, 'Man', 'man-' || v_man || '@ejemplo.com', 'Manager',   'Activo', v_man),
    (v_dueno, 'Dev', 'dev-' || v_dev || '@ejemplo.com', 'Developer', 'Activo', v_dev);
  -- El cliente del proyecto pasa a tener cuenta de portal (dentro de la transacción).
  update public.clients set email = 'por-' || v_por || '@ejemplo.com', portal_user_id = v_por where id = v_cli;

  -- 1) El dueño crea
  perform set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.project_milestones (project_id, title, due_date) values (v_proy, 'Diseño aprobado', current_date + 7) returning id into v_h;
  execute 'reset role';
  v_res := v_res || E'\n  OK    1) el dueño crea un hito';

  -- 2) Un Manager crea (aunque mande su user_id, queda a nombre del dueño) y edita
  perform set_config('request.jwt.claims', json_build_object('sub', v_man, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.project_milestones (user_id, project_id, title) values (v_man, v_proy, 'Entrega beta') returning user_id into v_uid;
  update public.project_milestones set status = 'en_curso' where id = v_h;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_uid = v_dueno and v_n = 1 then v_res := v_res || E'\n  OK    2) Manager crea (a nombre del dueño) y cambia el estado';
  else v_res := v_res || format(E'\n  FALLA 2) dueño del hito %s, editados %s', v_uid, v_n); v_f := v_f + 1; end if;

  -- 3) Un Manager no puede colgar hitos de proyectos de otra cuenta
  perform set_config('request.jwt.claims', json_build_object('sub', v_man, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.project_milestones (project_id, title) values (v_proy_ajeno, 'intruso');
    v_res := v_res || E'\n  FALLA 3) hito creado en un proyecto ajeno'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    3) Manager no puede crear hitos en proyectos de otra cuenta';
  end;
  execute 'reset role';

  -- 4-5) Un Developer ve, pero no crea ni edita
  perform set_config('request.jwt.claims', json_build_object('sub', v_dev, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.project_milestones where project_id = v_proy;
  begin
    insert into public.project_milestones (project_id, title) values (v_proy, 'no');
    v_res := v_res || E'\n  FALLA 4) un Developer puede crear hitos'; v_f := v_f + 1;
  exception when insufficient_privilege then
    if v_n >= 2 then v_res := v_res || E'\n  OK    4) Developer ve los hitos y no puede crear';
    else v_res := v_res || format(E'\n  FALLA 4) Developer ve %s hitos', v_n); v_f := v_f + 1; end if;
  end;
  update public.project_milestones set title = 'x' where id = v_h;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 then v_res := v_res || E'\n  OK    5) Developer no puede editar';
  else v_res := v_res || E'\n  FALLA 5) un Developer edita hitos'; v_f := v_f + 1; end if;

  -- 6) El cliente del portal ve los hitos de su proyecto
  perform set_config('request.jwt.claims', json_build_object('sub', v_por, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.project_milestones where project_id = v_proy;
  update public.project_milestones set status = 'entregado' where id = v_h;
  get diagnostics v_m = row_count;
  execute 'reset role';
  if v_n >= 2 then v_res := v_res || E'\n  OK    6) el cliente del portal ve los hitos de su proyecto';
  else v_res := v_res || format(E'\n  FALLA 6) el portal ve %s hitos', v_n); v_f := v_f + 1; end if;

  -- 7) ...pero no puede marcarlos
  if (select status from public.project_milestones where id = v_h) = 'en_curso' then
    v_res := v_res || E'\n  OK    7) el cliente no puede cambiar hitos';
  else v_res := v_res || E'\n  FALLA 7) el cliente cambió un hito'; v_f := v_f + 1; end if;

  -- 8) Un extraño no ve nada
  perform set_config('request.jwt.claims', json_build_object('sub', v_ext, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.project_milestones;
  execute 'reset role';
  if v_n = 0 then v_res := v_res || E'\n  OK    8) una cuenta ajena no ve ningún hito';
  else v_res := v_res || format(E'\n  FALLA 8) una cuenta ajena ve %s hitos', v_n); v_f := v_f + 1; end if;

  -- 9) Estado desconocido
  begin
    update public.project_milestones set status = 'hecho' where id = v_h;
    v_res := v_res || E'\n  FALLA 9) estado desconocido aceptado'; v_f := v_f + 1;
  exception when check_violation then
    v_res := v_res || E'\n  OK    9) estado desconocido rechazado';
  end;

  raise exception E'HITOS DE PROYECTO — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)', v_f, v_res;
end $$;
