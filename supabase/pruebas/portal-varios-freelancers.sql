-- Portal: una persona cliente de dos freelancers ve los documentos de los dos.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/portal-varios-freelancers.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea usuarios de prueba y termina siempre con una
-- excepción a propósito que deshace la transacción entera. Lee el texto.

do $$
declare
  v_a   uuid := gen_random_uuid();   -- freelancer A
  v_b   uuid := gen_random_uuid();   -- freelancer B
  v_c   uuid := gen_random_uuid();   -- freelancer C (no tiene nada que ver)
  v_x   uuid := gen_random_uuid();   -- la persona cliente
  v_mail text := 'cliente-' || gen_random_uuid() || '@ejemplo.com';
  v_cli_a uuid; v_cli_b uuid; v_cli_c uuid;
  v_k_a uuid; v_k_b uuid; v_k_c uuid;
  v_p_a uuid; v_p_b uuid; v_p_c uuid;
  v_n   int;
  v_res text := '';
  v_f   int := 0;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at) values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a-' || v_a || '@ejemplo.com', '{"full_name":"A"}', now()),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-' || v_b || '@ejemplo.com', '{"full_name":"B"}', now()),
    (v_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c-' || v_c || '@ejemplo.com', '{"full_name":"C"}', now()),
    (v_x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_mail, '{"full_name":"X"}', now());

  insert into public.clients (user_id, name, email) values (v_a, 'X para A', v_mail) returning id into v_cli_a;
  insert into public.clients (user_id, name, email) values (v_b, 'X para B', upper(v_mail)) returning id into v_cli_b;
  insert into public.clients (user_id, name, email) values (v_c, 'Otro de C', 'otro-' || v_mail) returning id into v_cli_c;
  insert into public.projects (user_id, name, client_id, status) values (v_a, 'P A', v_cli_a, 'in-progress') returning id into v_p_a;
  insert into public.projects (user_id, name, client_id, status) values (v_b, 'P B', v_cli_b, 'in-progress') returning id into v_p_b;
  insert into public.projects (user_id, name, client_id, status) values (v_c, 'P C', v_cli_c, 'in-progress') returning id into v_p_c;
  insert into public.contracts (user_id, client_id, project_id, content, status) values (v_a, v_cli_a, v_p_a, 'Contrato A', 'sent') returning id into v_k_a;
  insert into public.contracts (user_id, client_id, project_id, content, status) values (v_b, v_cli_b, v_p_b, 'Contrato B', 'sent') returning id into v_k_b;
  insert into public.contracts (user_id, client_id, project_id, content, status) values (v_c, v_cli_c, v_p_c, 'Contrato C', 'sent') returning id into v_k_c;

  -- Situación de antes: X ya estaba enlazada a la ficha de A.
  update public.clients set portal_user_id = v_x where id = v_cli_a;

  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated', 'email', v_mail)::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from public.link_portal_client();
  if v_n = 2 then v_res := v_res || E'\n  OK    1) el portal devuelve las dos fichas (A y B)';
  else v_res := v_res || E'\n  FALLA 1) fichas devueltas: ' || v_n; v_f := v_f + 1; end if;

  select count(*) into v_n from public.contracts where id in (v_k_a, v_k_b);
  if v_n = 2 then v_res := v_res || E'\n  OK    2) ve el contrato de A y el de B';
  else v_res := v_res || E'\n  FALLA 2) contratos visibles: ' || v_n; v_f := v_f + 1; end if;

  select count(*) into v_n from public.contracts where id = v_k_c;
  if v_n = 0 then v_res := v_res || E'\n  OK    3) no ve el contrato de otro cliente';
  else v_res := v_res || E'\n  FALLA 3) ve el contrato de C'; v_f := v_f + 1; end if;

  select count(*) into v_n from public.link_portal_client();
  if v_n = 2 then v_res := v_res || E'\n  OK    4) volver a entrar no duplica nada';
  else v_res := v_res || E'\n  FALLA 4) segunda entrada: ' || v_n; v_f := v_f + 1; end if;
  execute 'reset role';

  -- B cambia el correo de su ficha: el enlace de esa ficha tiene que caer.
  update public.clients set email = 'nuevo-' || v_mail where id = v_cli_b;
  execute 'set local role authenticated';
  select count(*) into v_n from public.link_portal_client();
  if v_n = 1 then v_res := v_res || E'\n  OK    5) ficha con otro correo: se desenlaza';
  else v_res := v_res || E'\n  FALLA 5) fichas tras el cambio de correo: ' || v_n; v_f := v_f + 1; end if;
  select count(*) into v_n from public.contracts where id = v_k_b;
  if v_n = 0 then v_res := v_res || E'\n  OK    6) y su contrato deja de verse';
  else v_res := v_res || E'\n  FALLA 6) sigue viendo el contrato de B'; v_f := v_f + 1; end if;
  execute 'reset role';

  execute 'set local role anon';
  begin
    perform public.link_portal_client();
    v_res := v_res || E'\n  FALLA 7) anon puede llamar a link_portal_client'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    7) sin sesión no se puede llamar';
  end;
  execute 'reset role';

  raise exception E'PORTAL CON VARIOS FREELANCERS — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
