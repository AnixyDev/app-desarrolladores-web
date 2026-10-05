-- Prueba de la migración 20261005120000_irpf_recurrentes_y_registro_fiscal_solo_por_funcion.
-- Se ejecuta entera y se DESHACE al final (raise): no deja nada en la base de datos.
-- Resultado esperado: «RESULTADO: ok ...» sin ningún «FALLO».
do $prueba$
declare r text := ''; v_user uuid; v_inv uuid; v_rec public.fiscal_records;
begin
  -- 1. Un usuario con sesión no puede escribir en fiscal_records.
  r := r || case when has_table_privilege('authenticated', 'public.fiscal_records', 'INSERT') then 'FALLO insert directo; ' else 'ok sin insert directo; ' end;
  r := r || case when has_table_privilege('authenticated', 'public.fiscal_records', 'UPDATE') then 'FALLO update; ' else 'ok sin update; ' end;
  r := r || case when has_table_privilege('authenticated', 'public.fiscal_records', 'SELECT') then 'ok sigue leyendo; ' else 'FALLO no puede leer; ' end;
  r := r || case when exists (select 1 from pg_policies where tablename = 'fiscal_records' and cmd = 'INSERT') then 'FALLO política insert; ' else 'ok sin política insert; ' end;

  -- 2. registrar_factura_fiscal: solo el servidor.
  r := r || case when has_function_privilege('authenticated', 'public.registrar_factura_fiscal(uuid, uuid)', 'EXECUTE') then 'FALLO usuario puede llamar; ' else 'ok solo servidor; ' end;

  -- 3. Registro de una factura sin registro de un usuario con NIF (si hay).
  select i.id, i.user_id into v_inv, v_user from public.invoices i join public.profiles p on p.id = i.user_id
   where coalesce(btrim(p.tax_id), '') <> '' and not exists (select 1 from public.fiscal_records f where f.invoice_id = i.id) limit 1;
  if v_inv is not null then
    perform set_config('request.jwt.claim.role', 'service_role', true);
    v_rec := public.registrar_factura_fiscal(v_inv, v_user);
    r := r || case when v_rec.hash = encode(extensions.digest(v_rec.hash_input, 'sha256'), 'hex') then 'ok huella; ' else 'FALLO huella; ' end;
    begin perform public.registrar_factura_fiscal(v_inv, v_user); r := r || 'FALLO duplicado; ';
    exception when others then r := r || 'ok duplicado rechazado; '; end;
  else r := r || '(sin factura de prueba); '; end if;

  -- 4. IRPF de recurrentes.
  r := r || case when exists (select 1 from information_schema.columns where table_name = 'recurring_invoices' and column_name = 'irpf_percent') then 'ok irpf_percent; ' else 'FALLO sin irpf_percent; ' end;

  raise exception 'RESULTADO: %', r;
end $prueba$;
