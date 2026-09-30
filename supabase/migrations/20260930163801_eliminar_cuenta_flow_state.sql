-- Eliminar cuenta (30/09/2026): auth.flow_state (estados temporales del
-- inicio de sesión) guarda user_id sin clave foránea, así que no cae al borrar
-- el usuario. Se borra aquí, junto al resto de lo que no cae en cascada.
create or replace function public.eliminar_datos_de_cuenta(p_user uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_facturas int;
  v_ultima date;
  v_perfil public.profiles%rowtype;
begin
  select * into v_perfil from public.profiles where id = p_user;
  if not found then
    raise exception 'La cuenta no existe' using errcode = 'P0002';
  end if;

  perform set_config('app.eliminar_cuenta', p_user::text, true);

  -- Archivo fiscal: facturas, registros Veri*Factu, cobros y las fichas de sus clientes.
  select count(*), max(issue_date) into v_facturas, v_ultima from public.invoices where user_id = p_user;
  if v_facturas > 0 then
    insert into public.archivo_fiscal_cuentas_eliminadas
      (user_id, emisor, facturas, registros_fiscales, cobros, clientes, conservar_hasta)
    values (
      p_user,
      jsonb_build_object(
        'nombre', coalesce(v_perfil.business_name, v_perfil.full_name),
        'email', v_perfil.email,
        'nif', v_perfil.tax_id,
        'direccion', concat_ws(', ', v_perfil.fiscal_street, v_perfil.fiscal_postal_code, v_perfil.fiscal_city, v_perfil.fiscal_province)
      ),
      (select coalesce(jsonb_agg(to_jsonb(i) order by i.issue_date, i.invoice_number), '[]') from public.invoices i where i.user_id = p_user),
      (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]') from public.fiscal_records f where f.user_id = p_user),
      (select coalesce(jsonb_agg(to_jsonb(p) order by p.paid_at), '[]') from public.payments p
         where p.invoice_id in (select id from public.invoices where user_id = p_user)),
      (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'email', c.email, 'tax_id', c.tax_id, 'address', c.address)), '[]')
         from public.clients c where c.id in (select client_id from public.invoices where user_id = p_user)),
      (make_date(extract(year from greatest(current_date, v_ultima))::int + 4, 12, 31))
    );
  end if;

  -- Lo ajeno se desengancha (los cobros de suscripción son ingresos de la plataforma).
  update public.platform_payments set user_id = null, user_email = null where user_id = p_user;
  update public.referrals set status = 'Cancelled', referred_user_name = null where referred_user_id = p_user;

  -- Tablas sin clave foránea al usuario: se borran a mano.
  delete from public.payments where user_id = p_user or invoice_id in (select id from public.invoices where user_id = p_user);
  delete from public.fiscal_records where user_id = p_user;
  delete from public.invoices where user_id = p_user;
  delete from public.budgets where user_id = p_user;
  delete from public.proposals where user_id = p_user;
  delete from public.expenses where user_id = p_user;
  delete from public.project_milestones where user_id = p_user;
  delete from public.project_comments where user_id = p_user::text;  -- esta columna es text
  delete from public.time_entries where user_id = p_user;
  delete from public.tasks where user_id = p_user;
  delete from public.jobs where user_id = p_user;
  delete from public.webhooks_enviados where user_id = p_user;
  delete from public.rate_limit_buckets where user_id = p_user;
  delete from auth.flow_state where user_id = p_user;

  return jsonb_build_object('facturas_archivadas', v_facturas);
end;
$function$;

revoke all on function public.eliminar_datos_de_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_datos_de_cuenta(uuid) to service_role;
