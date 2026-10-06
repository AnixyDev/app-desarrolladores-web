-- Un cliente con facturas no se puede borrar desde la app (06/10/2026, decisión de Ana).
--
-- Antes, borrar un cliente arrastraba en cascada sus facturas y cobros (y
-- proyectos, contratos, presupuestos…). Las facturas emitidas hay que
-- conservarlas aunque no lleven registro fiscal. Y si alguna lo llevaba, la
-- clave foránea de fiscal_records hacía fallar el borrado entero, mientras la
-- pantalla daba el cliente por borrado.
--
-- Solo frena al navegador (roles anon/authenticated). La baja de una cuenta
-- (eliminar_datos_de_cuenta, con la clave de servicio) y el borrado de un
-- usuario en Auth siguen funcionando: sus facturas fiscales ya se archivan.
--
-- SECURITY INVOKER a propósito: dentro de una función SECURITY DEFINER
-- current_user sería postgres y no frenaría nada (lección del 27/09).

create or replace function public.clients_no_borrar_con_facturas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_n int;
begin
  if current_user not in ('anon', 'authenticated') then
    return old;
  end if;
  select count(*) into v_n from public.invoices where client_id = old.id;
  if v_n > 0 then
    raise exception 'Este cliente tiene % factura(s) emitida(s) y no se puede borrar: hay que conservarlas.', v_n
      using errcode = 'DF001',
            hint = 'Descarga sus facturas desde la ficha del cliente si quieres tu propia copia.';
  end if;
  return old;
end;
$$;

revoke execute on function public.clients_no_borrar_con_facturas() from public, anon, authenticated;

drop trigger if exists clients_no_borrar_con_facturas on public.clients;
create trigger clients_no_borrar_con_facturas
  before delete on public.clients
  for each row execute function public.clients_no_borrar_con_facturas();
