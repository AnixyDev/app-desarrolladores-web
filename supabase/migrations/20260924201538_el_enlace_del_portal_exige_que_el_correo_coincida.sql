-- Sustituye a la versión anterior del disparador, que miraba si el enlace
-- "se estaba tocando a propósito" para decidir si cortarlo. Eso era adivinar
-- la intención de quien escribe, y fallaba: un UPDATE que cambiaba el correo
-- y repetía el mismo portal_user_id parecía un cambio deliberado del enlace
-- cuando no lo era.
--
-- Esta versión no adivina. Exige la regla de verdad: portal_user_id solo
-- puede apuntar a una cuenta cuyo correo sea el de la ficha. Si la fila
-- resultante no cumple eso, el enlace se corta, venga el cambio de donde
-- venga. También vale para INSERT, así que tampoco se puede colar un enlace
-- inventado al crear la ficha.
--
-- Comprobado en producción con supabase/pruebas/enlace-del-portal.sql.

create or replace function public.clients_desenlazar_portal_si_cambia_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_email_de_la_cuenta text;
begin
  if new.portal_user_id is null then
    return new;
  end if;

  select lower(u.email) into v_email_de_la_cuenta
    from auth.users u
   where u.id = new.portal_user_id;

  -- Cuenta inexistente o correo que ya no coincide: el enlace no es cierto
  -- y once políticas RLS se fían de él, así que no se queda.
  if v_email_de_la_cuenta is null
     or v_email_de_la_cuenta is distinct from lower(new.email)
  then
    new.portal_user_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists clients_desenlazar_portal on public.clients;
create trigger clients_desenlazar_portal
  before insert or update on public.clients
  for each row
  execute function public.clients_desenlazar_portal_si_cambia_email();
