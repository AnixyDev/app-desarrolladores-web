-- Comprobación de los recordatorios de cobro (30/09/2026).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/recordatorios-cobro.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea sus propias filas con dos perfiles existentes
-- y termina siempre con una excepción a propósito, que deshace la transacción
-- entera. El resultado aparece como un mensaje de error: eso es lo normal.

do $prueba$
declare
  v_a uuid; v_b uuid; v_cli uuid; v_fac uuid; v_n int; v_txt text; v_res text := ''; v_fallos int := 0;
begin
  select id into v_a from public.profiles order by id limit 1;
  select id into v_b from public.profiles where id <> v_a order by id limit 1;

  -- Datos propios de la prueba (como postgres, sin RLS).
  insert into public.clients (user_id, name, email) values (v_a, 'Cliente prueba recordatorios', 'prueba-recordatorios@example.com')
  returning id into v_cli;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid)
  values (v_a, v_cli, 'PRUEBA-REC-1', current_date - 40, current_date - 5, '[]'::jsonb, 10000, 21, 12100, false)
  returning id into v_fac;

  -- 1) la columna nace activa
  if (select recordatorios_activos from public.invoices where id = v_fac)
  then v_res := v_res || E'\nOK  1 las facturas nacen con recordatorios activos';
  else v_res := v_res || E'\nMAL 1 recordatorios_activos no es true'; v_fallos := v_fallos + 1; end if;

  -- 2) la clave primaria impide el doble envío
  insert into public.recordatorios_cobro_enviados (invoice_id, nivel, user_id, destinatario) values (v_fac, 3, v_a, 'x@example.com');
  begin
    insert into public.recordatorios_cobro_enviados (invoice_id, nivel, user_id) values (v_fac, 3, v_a);
    v_txt := 'duplicó';
  exception when unique_violation then v_txt := 'rechazado';
  end;
  if v_txt = 'rechazado' then v_res := v_res || E'\nOK  2 el mismo nivel no se apunta dos veces';
  else v_res := v_res || E'\nMAL 2 se apuntó dos veces'; v_fallos := v_fallos + 1; end if;

  -- 3) el dueño ve su apunte y puede apagar la campana de su factura
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.recordatorios_cobro_enviados where invoice_id = v_fac;
  update public.invoices set recordatorios_activos = false where id = v_fac;
  if v_n = 1 and not (select recordatorios_activos from public.invoices where id = v_fac)
  then v_res := v_res || E'\nOK  3 el dueño ve lo enviado y apaga la campana';
  else v_res := v_res || format(E'\nMAL 3 ve %s', v_n); v_fallos := v_fallos + 1; end if;

  -- 4) el navegador no puede apuntar envíos (ni borrarlos)
  begin
    insert into public.recordatorios_cobro_enviados (invoice_id, nivel, user_id) values (v_fac, 15, v_a);
    v_txt := 'insertó';
  exception when insufficient_privilege then v_txt := 'rechazado';
  end;
  if v_txt = 'rechazado' then v_res := v_res || E'\nOK  4 solo el servidor apunta envíos';
  else v_res := v_res || E'\nMAL 4 authenticated insertó'; v_fallos := v_fallos + 1; end if;

  -- 5) otro usuario no ve los envíos ajenos
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.recordatorios_cobro_enviados where invoice_id = v_fac;
  if v_n = 0 then v_res := v_res || E'\nOK  5 otro usuario no ve los envíos ajenos';
  else v_res := v_res || format(E'\nMAL 5 ve %s', v_n); v_fallos := v_fallos + 1; end if;

  -- 6) anon no ve nada
  reset role;
  set local role anon;
  begin
    select count(*) into v_n from public.recordatorios_cobro_enviados;
    v_txt := 'leyó';
  exception when insufficient_privilege then v_txt := 'rechazado';
  end;
  reset role;
  if v_txt = 'rechazado' then v_res := v_res || E'\nOK  6 anon no tiene acceso';
  else v_res := v_res || E'\nMAL 6 anon leyó'; v_fallos := v_fallos + 1; end if;

  -- 7) borrar la factura borra sus apuntes
  delete from public.invoices where id = v_fac;
  if not exists (select 1 from public.recordatorios_cobro_enviados where invoice_id = v_fac)
  then v_res := v_res || E'\nOK  7 borrar la factura borra sus apuntes';
  else v_res := v_res || E'\nMAL 7 quedaron apuntes'; v_fallos := v_fallos + 1; end if;

  -- 8) la tarea diaria existe una sola vez
  select count(*) into v_n from cron.job where jobname = 'recordatorios-cobro-diario' and schedule = '30 7 * * *';
  if v_n = 1 then v_res := v_res || E'\nOK  8 tarea diaria programada (07:30 UTC)';
  else v_res := v_res || format(E'\nMAL 8 tareas: %s', v_n); v_fallos := v_fallos + 1; end if;

  raise exception E'RESULTADO (se deshace todo): % fallos%', v_fallos, v_res;
end $prueba$;
