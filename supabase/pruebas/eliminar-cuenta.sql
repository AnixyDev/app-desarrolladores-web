-- Comprobación de la baja de una cuenta (30/09/2026).
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/eliminar-cuenta.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea una cuenta desechable, la da de baja y
-- termina siempre con una excepción a propósito, que deshace la transacción
-- entera. El resultado aparece como un mensaje de error: eso es lo normal.

do $prueba$
declare
  v_u uuid := gen_random_uuid();          -- la cuenta que se da de baja
  v_otro uuid;                            -- otra cuenta (freelancer y afiliada)
  v_cli uuid; v_proy uuid; v_fac uuid; v_ficha_ajena uuid; v_ref uuid; v_arch record;
  v_quedan text := ''; v_n bigint; v_res text := ''; v_fallos int := 0; r record;
begin
  select id into v_otro from public.profiles where id <> v_u order by id limit 1;

  insert into auth.users (id, email, created_at, updated_at, aud, role, raw_user_meta_data)
  values (v_u, 'baja-prueba@example.com', now(), now(), 'authenticated', 'authenticated', '{"full_name":"Baja Prueba"}');
  update public.profiles set business_name = 'Baja Prueba SL', tax_id = '00000000T', fiscal_city = 'Málaga' where id = v_u;

  -- Datos propios
  insert into public.clients (user_id, name, email, tax_id) values (v_u, 'Cliente de la baja', 'cli@example.com', 'B00000000') returning id into v_cli;
  insert into public.projects (user_id, client_id, name) values (v_u, v_cli, 'Proyecto de la baja') returning id into v_proy;
  insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid, fiscal_locked)
  values (v_u, v_cli, 'INV-2026-0001', '2026-09-01', '2026-10-01', '[]', 10000, 21, 12100, false, true) returning id into v_fac;
  insert into public.fiscal_records (user_id, invoice_id, record_type, tipo_factura, numero_factura, fecha_expedicion, importe_total_cents, nif_emisor, nombre_emisor, hash, hash_input, modalidad, estado_envio)
  values (v_u, v_fac, 'alta', 'F1', 'INV-2026-0001', '2026-09-01', 12100, '00000000T', 'Baja Prueba SL', 'x', 'x', 'no_verifactu', 'no_aplica');
  insert into public.payments (user_id, invoice_id, amount_cents, paid_at) values (v_u, v_fac, 5000, now());
  insert into public.budgets (user_id, client_id, description) values (v_u, v_cli, 'Presupuesto');
  insert into public.tasks (user_id, project_id, description) values (v_u, v_proy, 'Tarea');
  insert into public.time_entries (user_id, project_id, start_time, duration_seconds) values (v_u, v_proy, now(), 60);
  insert into public.expenses (user_id, description, amount_cents, tax_percent, date, category) values (v_u, 'Gasto', 100, 21, current_date, 'Otros');
  insert into public.jobs (user_id, titulo) values (v_u, 'Oferta de la baja');
  insert into public.platform_payments (user_id, user_email, plan_name, amount_cents, stripe_session_id) values (v_u, 'baja-prueba@example.com', 'Pro', 395, 'cs_prueba_baja');

  -- Lo que es de otros y la nombra
  insert into public.clients (user_id, name, email, portal_user_id) values (v_otro, 'Ficha de otro freelancer', 'baja-prueba@example.com', v_u) returning id into v_ficha_ajena;
  insert into public.referrals (referrer_id, referred_user_id, referred_user_name, status, user_id) values (v_otro, v_u, 'Baja', 'Active', v_otro) returning id into v_ref;
  insert into public.comisiones_afiliado (referral_id, referrer_id, stripe_invoice_id, base_cents, comision_cents) values (v_ref, v_otro, 'in_prueba_baja', 395, 79);

  -- La baja: lo mismo que hace la Edge Function (menos Stripe y ficheros).
  perform public.eliminar_datos_de_cuenta(v_u);
  delete from auth.users where id = v_u;

  -- 1) no queda ninguna fila con su id en ninguna columna de usuario
  for r in
    select c.table_schema, c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.data_type = 'uuid' and c.table_name <> 'archivo_fiscal_cuentas_eliminadas'
      and c.column_name in ('id','user_id','owner_id','author_id','applicant_id','buyer_id','seller_id','actor_id','accepted_user_id','portal_user_id','logged_by','referrer_id','referred_user_id','invited_by','creado_por')
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.table_schema, r.table_name, r.column_name) into v_n using v_u;
    if v_n > 0 then v_quedan := v_quedan || format(' %s.%s=%s', r.table_name, r.column_name, v_n); end if;
  end loop;
  if v_quedan = '' and not exists (select 1 from public.clients where id = v_cli) and not exists (select 1 from public.projects where id = v_proy)
  then v_res := v_res || E'\nOK  1 no queda ninguna fila suya en public';
  else v_res := v_res || E'\nMAL 1 quedan:' || v_quedan; v_fallos := v_fallos + 1; end if;

  -- 2) lo fiscal está en el archivo, hasta el 31/12 del cuarto año
  select * into v_arch from public.archivo_fiscal_cuentas_eliminadas where user_id = v_u;
  if found and jsonb_array_length(v_arch.facturas) = 1 and jsonb_array_length(v_arch.registros_fiscales) = 1
     and jsonb_array_length(v_arch.cobros) = 1 and v_arch.clientes->0->>'tax_id' = 'B00000000'
     and v_arch.emisor->>'nif' = '00000000T' and v_arch.conservar_hasta = make_date(extract(year from current_date)::int + 4, 12, 31)
  then v_res := v_res || E'\nOK  2 facturas, registro fiscal, cobro y cliente archivados 4 años';
  else v_res := v_res || E'\nMAL 2 archivo fiscal incompleto'; v_fallos := v_fallos + 1; end if;

  -- 3) lo ajeno sigue, desenganchado
  if exists (select 1 from public.clients where id = v_ficha_ajena and portal_user_id is null)
     and exists (select 1 from public.referrals where id = v_ref and referred_user_id is null and referred_user_name is null and status = 'Cancelled')
     and exists (select 1 from public.comisiones_afiliado where referral_id = v_ref)
     and exists (select 1 from public.platform_payments where stripe_session_id = 'cs_prueba_baja' and user_id is null and user_email is null)
  then v_res := v_res || E'\nOK  3 ficha ajena, comisión del afiliado y cobro de la plataforma siguen, sin datos suyos';
  else v_res := v_res || E'\nMAL 3 se tocó algo ajeno'; v_fallos := v_fallos + 1; end if;

  -- 4) el bloqueo fiscal sigue funcionando para los demás
  begin
    insert into public.invoices (user_id, client_id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid, fiscal_locked)
    values (v_otro, v_ficha_ajena, 'PRUEBA-BLOQ-1', current_date, current_date, '[]', 100, 21, 121, false, true) returning id into v_fac;
    delete from public.invoices where id = v_fac;
    v_res := v_res || E'\nMAL 4 se borró una factura fiscal sin baja'; v_fallos := v_fallos + 1;
  exception when others then
    if sqlerrm like '%Veri*Factu%' then
      v_res := v_res || E'\nOK  4 fuera de una baja, una factura fiscal sigue sin poder borrarse';
    else
      v_res := v_res || E'\nMAL 4 ' || sqlerrm; v_fallos := v_fallos + 1;
    end if;
  end;

  -- 5) nadie desde el navegador puede lanzar la baja de otro ni leer el archivo
  set local role authenticated;
  begin
    perform public.eliminar_datos_de_cuenta(v_otro);
    v_res := v_res || E'\nMAL 5 authenticated ejecutó la baja'; v_fallos := v_fallos + 1;
  exception when insufficient_privilege then
    begin
      perform count(*) from public.archivo_fiscal_cuentas_eliminadas;
      v_res := v_res || E'\nMAL 5 authenticated lee el archivo'; v_fallos := v_fallos + 1;
    exception when insufficient_privilege then
      v_res := v_res || E'\nOK  5 solo el servidor da de baja y lee el archivo';
    end;
  end;
  reset role;

  -- 6) la purga borra lo vencido y nada más
  update public.archivo_fiscal_cuentas_eliminadas set conservar_hasta = current_date - 1 where user_id = v_u;
  v_n := public.purgar_archivo_fiscal();
  if v_n >= 1 and not exists (select 1 from public.archivo_fiscal_cuentas_eliminadas where user_id = v_u)
     and exists (select 1 from cron.job where jobname = 'purgar-archivo-fiscal')
  then v_res := v_res || E'\nOK  6 la purga diaria borra lo vencido';
  else v_res := v_res || format(E'\nMAL 6 purgadas %s, quedan %s, rol %s', v_n,
         (select count(*) from public.archivo_fiscal_cuentas_eliminadas where user_id = v_u), current_user);
       v_fallos := v_fallos + 1; end if;

  raise exception E'RESULTADO (se deshace todo): % fallos%', v_fallos, v_res;
end $prueba$;
