-- Comprobación de la cuota de autónomo (29/09/2026).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/cuota-autonomo.sql
--
-- ES SEGURO EN PRODUCCIÓN: usa dos perfiles existentes y termina siempre con
-- una excepción a propósito, que deshace la transacción entera. El resultado
-- aparece como un mensaje de error: eso es lo normal.

do $prueba$
declare
  v_a uuid; v_b uuid; v_n int; v_res text := ''; v_fallos int := 0; v_txt text;
begin
  select id into v_a from public.profiles order by id limit 1;
  select id into v_b from public.profiles where id <> v_a order by id limit 1;

  -- 1) último día hábil
  if public.ultimo_dia_habil('2026-10-01') = '2026-10-30' and public.ultimo_dia_habil('2026-05-15') = '2026-05-29'
     and public.ultimo_dia_habil('2026-09-01') = '2026-09-30'
  then v_res := v_res || E'\nOK  1 último día hábil (31/10 sábado → 30; 31/05 domingo → 29)';
  else v_res := v_res || E'\nMAL 1 último día hábil'; v_fallos := v_fallos + 1; end if;

  -- 2) A pone tarifa plana desde junio (80 €) y cuota completa desde septiembre
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.cuotas_autonomo (desde, importe_cents, nota) values ('2026-06-01', 8000, 'Tarifa plana'), ('2026-09-01', 29400, null);
  v_n := public.registrar_mis_cuotas_autonomo();
  if v_n = 3 and (select count(*) from public.expenses where cuota_autonomo_mes is not null and amount_cents = 8000 and tax_percent = 0 and category = 'Cuota de autónomo') = 3
  then v_res := v_res || E'\nOK  2 junio, julio y agosto apuntados a 80 €; septiembre aún no (se carga el 30)';
  else v_res := v_res || format(E'\nMAL 2 apuntados %s', v_n); v_fallos := v_fallos + 1; end if;

  -- 3) idempotente
  if public.registrar_mis_cuotas_autonomo() = 0 then v_res := v_res || E'\nOK  3 repetir no duplica';
  else v_res := v_res || E'\nMAL 3 duplicó'; v_fallos := v_fallos + 1; end if;

  -- 4) borrar julio no lo resucita
  delete from public.expenses where cuota_autonomo_mes = '2026-07-01';
  if public.registrar_mis_cuotas_autonomo() = 0 and not exists (select 1 from public.expenses where cuota_autonomo_mes = '2026-07-01')
  then v_res := v_res || E'\nOK  4 un mes borrado no vuelve a aparecer';
  else v_res := v_res || E'\nMAL 4 reapareció'; v_fallos := v_fallos + 1; end if;

  -- 5) B no ve las cuotas de A ni puede crearlas a su nombre
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.cuotas_autonomo;
  begin
    insert into public.cuotas_autonomo (user_id, desde, importe_cents) values (v_a, '2027-01-01', 1);
    v_txt := 'insertó';
  exception when insufficient_privilege then v_txt := 'rechazado';
  end;
  if v_n = 0 and v_txt = 'rechazado' then v_res := v_res || E'\nOK  5 otro usuario ni ve ni escribe cuotas ajenas';
  else v_res := v_res || format(E'\nMAL 5 ve %s, %s', v_n, v_txt); v_fallos := v_fallos + 1; end if;

  -- 6) el navegador no puede lanzar el registro de otros
  begin
    perform public._registrar_cuotas_autonomo(v_a, current_date);
    v_res := v_res || E'\nMAL 6 authenticated llamó a _registrar'; v_fallos := v_fallos + 1;
  exception when insufficient_privilege then
    begin
      perform public.registrar_cuotas_autonomo_todas();
      v_res := v_res || E'\nMAL 6 authenticated llamó a _todas'; v_fallos := v_fallos + 1;
    exception when insufficient_privilege then
      v_res := v_res || E'\nOK  6 solo el cron registra para todos';
    end;
  end;

  -- 7) importe 0 = baja: ese mes no genera gasto
  reset role;
  delete from public.cuota_autonomo_meses where user_id = v_b;
  insert into public.cuotas_autonomo (user_id, desde, importe_cents) values (v_b, '2026-07-01', 29400), (v_b, '2026-08-01', 0);
  v_n := public._registrar_cuotas_autonomo(v_b, '2026-09-29');
  if v_n = 1 and (select count(*) from public.cuota_autonomo_meses where user_id = v_b) = 2
  then v_res := v_res || E'\nOK  7 un mes con importe 0 queda anotado sin gasto';
  else v_res := v_res || format(E'\nMAL 7 apuntados %s', v_n); v_fallos := v_fallos + 1; end if;

  -- 8) el cron existe
  if exists (select 1 from cron.job where jobname = 'registrar-cuotas-autonomo') then v_res := v_res || E'\nOK  8 tarea diaria programada';
  else v_res := v_res || E'\nMAL 8 sin tarea'; v_fallos := v_fallos + 1; end if;

  raise exception E'RESULTADO (se deshace todo): % fallos%', v_fallos, v_res;
end $prueba$;
