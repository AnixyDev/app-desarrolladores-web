-- Comprobación de los roles del equipo (plan Teams).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/roles-del-equipo.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea tres miembros de prueba (Developer, Manager,
-- Admin) en el equipo del dueño de un proyecto existente, y termina siempre
-- con una excepción a propósito, que deshace la transacción entera. El
-- resultado aparece como un mensaje de error: eso es lo normal.

do $$
declare
  v_dueno uuid; v_proy uuid;
  v_dev uuid := gen_random_uuid(); v_man uuid := gen_random_uuid(); v_adm uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_res text := ''; v_fallos int := 0; v_n int; u uuid; r text;
begin
  select p.user_id, p.id into v_dueno, v_proy from public.projects p limit 1;
  if v_dueno is null then raise exception 'No hay proyectos con los que probar.'; end if;

  insert into auth.users (id, instance_id, aud, role, email) values
    (v_dev, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-' || v_dev || '@ejemplo.com'),
    (v_man, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'man-' || v_man || '@ejemplo.com'),
    (v_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adm-' || v_adm || '@ejemplo.com');
  insert into public.team_members (user_id, name, email, role, status, accepted_user_id) values
    (v_dueno, 'Dev', 'dev-' || v_dev || '@ejemplo.com', 'Developer', 'Activo', v_dev),
    (v_dueno, 'Man', 'man-' || v_man || '@ejemplo.com', 'Manager',   'Activo', v_man),
    (v_dueno, 'Adm', 'adm-' || v_adm || '@ejemplo.com', 'Admin',     'Activo', v_adm);
  insert into public.time_entries (user_id, project_id, start_time, duration_seconds, logged_by) values
    (v_dueno, v_proy, now(), 60, v_dev), (v_dueno, v_proy, now(), 60, v_man), (v_dueno, v_proy, now(), 60, v_adm);
  insert into public.tasks (user_id, project_id, description) values (v_dueno, v_proy, 'borrable 1') returning id into v_t1;
  insert into public.tasks (user_id, project_id, description) values (v_dueno, v_proy, 'borrable 2') returning id into v_t2;

  foreach u in array array[v_dev, v_man, v_adm] loop
    r := case u when v_dev then 'Developer' when v_man then 'Manager' else 'Admin' end;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    select count(*) into v_n from public.time_entries where logged_by in (v_dev, v_man, v_adm);
    if (r = 'Developer' and v_n = 1) or (r <> 'Developer' and v_n = 3) then
      v_res := v_res || format(E'\n  OK    %s ve %s de 3 registros de horas', r, v_n);
    else v_res := v_res || format(E'\n  FALLA %s ve %s registros de horas', r, v_n); v_fallos := v_fallos + 1; end if;

    update public.projects set description = coalesce(description, '') where id = v_proy;
    get diagnostics v_n = row_count;
    if (r = 'Developer' and v_n = 0) or (r <> 'Developer' and v_n = 1) then
      v_res := v_res || format(E'\n  OK    %s editar proyecto: %s', r, case v_n when 1 then 'si' else 'no' end);
    else v_res := v_res || format(E'\n  FALLA %s editar proyecto: filas=%s', r, v_n); v_fallos := v_fallos + 1; end if;

    begin
      update public.projects set user_id = u where id = v_proy;
      get diagnostics v_n = row_count;
      if v_n = 0 then v_res := v_res || format(E'\n  OK    %s no puede llevarse el proyecto', r);
      else v_res := v_res || format(E'\n  FALLA %s se llevo el proyecto a su cuenta', r); v_fallos := v_fallos + 1; end if;
    exception when insufficient_privilege then
      v_res := v_res || format(E'\n  OK    %s no puede llevarse el proyecto', r);
    end;

    begin
      update public.tasks set user_id = u where id = v_t1;
      get diagnostics v_n = row_count;
      if v_n = 0 then v_res := v_res || format(E'\n  OK    %s no puede llevarse una tarea', r);
      else v_res := v_res || format(E'\n  FALLA %s se llevo una tarea a su cuenta', r); v_fallos := v_fallos + 1; end if;
    exception when insufficient_privilege then
      v_res := v_res || format(E'\n  OK    %s no puede llevarse una tarea', r);
    end;

    update public.tasks set status = 'in_progress' where id = v_t1;
    get diagnostics v_n = row_count;
    if v_n = 1 then v_res := v_res || format(E'\n  OK    %s puede mover tareas', r);
    else v_res := v_res || format(E'\n  FALLA %s no puede mover tareas', r); v_fallos := v_fallos + 1; end if;

    delete from public.tasks where id = case r when 'Admin' then v_t2 else v_t1 end;
    get diagnostics v_n = row_count;
    if (r = 'Admin' and v_n = 1) or (r <> 'Admin' and v_n = 0) then
      v_res := v_res || format(E'\n  OK    %s borrar tareas: %s', r, case v_n when 1 then 'si' else 'no' end);
    else v_res := v_res || format(E'\n  FALLA %s borrar tareas: filas=%s', r, v_n); v_fallos := v_fallos + 1; end if;

    select count(*) into v_n from public.invoices where user_id = v_dueno;
    select v_n + count(*) into v_n from public.clients where user_id = v_dueno;
    if v_n = 0 then v_res := v_res || format(E'\n  OK    %s no ve clientes ni facturas', r);
    else v_res := v_res || format(E'\n  FALLA %s ve %s filas de clientes o facturas', r, v_n); v_fallos := v_fallos + 1; end if;

    execute 'reset role';
  end loop;

  -- Un Manager que deja de estar activo pierde lo que le daba el rol.
  update public.team_members set status = 'Inactivo' where accepted_user_id = v_man;
  perform set_config('request.jwt.claims', json_build_object('sub', v_man, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.time_entries where logged_by in (v_dev, v_adm);
  execute 'reset role';
  if v_n = 0 then v_res := v_res || E'\n  OK    Manager inactivo: ya no ve las horas del equipo';
  else v_res := v_res || format(E'\n  FALLA Manager inactivo ve %s horas ajenas', v_n); v_fallos := v_fallos + 1; end if;

  raise exception E'ROLES DEL EQUIPO — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)', v_fallos, v_res;
end $$;
