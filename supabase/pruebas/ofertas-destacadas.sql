-- Comprobación: una oferta de empleo solo se destaca pagando, su dueño no se
-- puede cambiar desde el navegador, y nadie puede meter pagos falsos en
-- platform_payments. El webhook de Stripe (clave de servicio) sí puede
-- destacar.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/ofertas-destacadas.sql
--
-- ES SEGURO EN PRODUCCIÓN: termina siempre con una excepción a propósito que
-- deshace la transacción entera. El resultado aparece como un mensaje de
-- error: eso es lo normal. Lee el texto.

do $$
declare
  v_id   uuid;
  v_otro uuid;
  v_job  uuid;
  v_ins  boolean;
  v_desp boolean;
  v_res  text := '';
  v_f    int := 0;
begin
  select id into v_id from public.profiles limit 1;
  select id into v_otro from public.profiles where id <> v_id limit 1;
  if v_id is null or v_otro is null then
    raise exception 'Hacen falta al menos dos perfiles para probar.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.jobs (user_id, titulo, isfeatured)
  values (v_id, 'prueba', true) returning id, isfeatured into v_job, v_ins;
  if v_ins then
    v_res := v_res || E'\n  FALLA 1) una oferta nace destacada sin pagar'; v_f := v_f + 1;
  else
    v_res := v_res || E'\n  OK    1) alta: nace sin destacar';
  end if;

  begin
    update public.jobs set isfeatured = true where id = v_job;
    v_res := v_res || E'\n  FALLA 2) se puede destacar con un update'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    2) destacar sin pagar: rechazado';
  end;

  begin
    update public.jobs set user_id = v_otro where id = v_job;
    v_res := v_res || E'\n  FALLA 3) se puede cambiar el dueño'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    3) cambio de dueño: rechazado';
  end;

  begin
    update public.jobs set titulo = 'prueba editada' where id = v_job;
    v_res := v_res || E'\n  OK    4) el dueño puede editar el resto';
  exception when others then
    v_res := v_res || E'\n  FALLA 4) editar el título: ' || sqlerrm; v_f := v_f + 1;
  end;

  begin
    insert into public.platform_payments (user_id, amount_cents) values (v_id, 999999);
    v_res := v_res || E'\n  FALLA 5) se pueden insertar pagos falsos'; v_f := v_f + 1;
  exception when insufficient_privilege then
    v_res := v_res || E'\n  OK    5) pagos falsos: rechazados';
  end;

  execute 'reset role';
  execute 'set local role service_role';
  update public.jobs set isfeatured = true where id = v_job;
  execute 'reset role';
  select isfeatured into v_desp from public.jobs where id = v_job;
  if v_desp then
    v_res := v_res || E'\n  OK    6) el webhook de Stripe puede destacar';
  else
    v_res := v_res || E'\n  FALLA 6) el webhook no puede destacar'; v_f := v_f + 1;
  end if;

  raise exception E'OFERTAS DESTACADAS — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_f, v_res;
end $$;
