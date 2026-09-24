-- Vínculo entre un cliente y su cuenta de Supabase Auth del portal
alter table public.clients add column if not exists portal_user_id uuid unique references auth.users(id);

-- Función que vincula automáticamente al iniciar sesión: busca un cliente con el mismo
-- email que la cuenta de Auth recién autenticada, y si aún no está vinculado, lo vincula.
-- SECURITY DEFINER: necesaria porque el cliente no tiene permiso propio para hacer
-- UPDATE en la tabla `clients` (esa tabla pertenece al freelancer, no al portal user).
create or replace function public.link_portal_client()
returns table(client_id uuid, client_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_client record;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    return;
  end if;

  -- ¿Ya está vinculado este usuario a un cliente?
  select id, name into v_client from public.clients where portal_user_id = auth.uid();
  if found then
    client_id := v_client.id;
    client_name := v_client.name;
    return next;
    return;
  end if;

  -- ¿Hay un cliente con este email aún sin vincular? Lo vinculamos ahora.
  select id, name into v_client from public.clients
    where lower(email) = v_email and portal_user_id is null
    limit 1;

  if found then
    update public.clients set portal_user_id = auth.uid() where id = v_client.id;
    client_id := v_client.id;
    client_name := v_client.name;
    return next;
  end if;

  return;
end;
$$;

grant execute on function public.link_portal_client() to authenticated;

-- Políticas de portal: el cliente vinculado puede LEER (no escribir) sus propios
-- proyectos, facturas, presupuestos, contratos y propuestas.
drop policy if exists "portal_client_select_projects" on public.projects;
create policy "portal_client_select_projects" on public.projects for select
  using (client_id in (select id from public.clients where portal_user_id = auth.uid()));

drop policy if exists "portal_client_select_invoices" on public.invoices;
create policy "portal_client_select_invoices" on public.invoices for select
  using (client_id in (select id from public.clients where portal_user_id = auth.uid()));

drop policy if exists "portal_client_select_budgets" on public.budgets;
create policy "portal_client_select_budgets" on public.budgets for select
  using (client_id in (select id from public.clients where portal_user_id = auth.uid()));

drop policy if exists "portal_client_select_contracts" on public.contracts;
create policy "portal_client_select_contracts" on public.contracts for select
  using (client_id in (select id from public.clients where portal_user_id = auth.uid()));

drop policy if exists "portal_client_select_proposals" on public.proposals;
create policy "portal_client_select_proposals" on public.proposals for select
  using (client_id in (select id from public.clients where portal_user_id = auth.uid()));

-- El cliente también puede firmar su propio contrato (UPDATE limitado, ya validado por status en frontend)
drop policy if exists "portal_client_update_contracts" on public.contracts;
create policy "portal_client_update_contracts" on public.contracts for update
  using (client_id in (select id from public.clients where portal_user_id = auth.uid()))
  with check (client_id in (select id from public.clients where portal_user_id = auth.uid()));
;
