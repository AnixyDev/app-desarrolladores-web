-- Comprobación del enlace del portal (clients.portal_user_id).
--
-- POR QUÉ ESTÁ EN SQL Y NO EN vitest: lo que hay que comprobar es un
-- disparador de Postgres. Un test de JavaScript solo podría leer el fichero
-- de la migración y comprobar que el texto sigue ahí, lo cual no prueba nada:
-- una migración posterior puede tirar el disparador y el test seguiría en
-- verde. Esto se ejecuta contra la base de datos de verdad.
--
-- CÓMO SE LANZA: pégalo entero en el editor SQL de Supabase, o
--   supabase db query --file supabase/pruebas/enlace-del-portal.sql
--
-- ES SEGURO EN PRODUCCIÓN: crea sus propias filas, y termina siempre con una
-- excepción a propósito para deshacer la transacción entera. El resultado
-- aparece como un mensaje de error: eso es lo normal. Lee el texto.
--
-- LA REGLA QUE COMPRUEBA: portal_user_id solo puede apuntar a una cuenta
-- cuyo correo sea el de la ficha. Once políticas RLS de ocho tablas leen esa
-- columna directamente, así que un enlace que no sea cierto da acceso a
-- proyectos, facturas, contratos, presupuestos, propuestas y mensajes de
-- otra persona.

do $$
declare
  v_cuenta   uuid;
  v_correo   text;
  v_dueno    uuid;
  v_ficha    uuid;
  v_resultado text := '';
  v_fallos   int := 0;
  v_visto    uuid;
begin
  select id, lower(email) into v_cuenta, v_correo
    from auth.users where email is not null order by created_at limit 1;
  -- (profiles no tiene created_at; vale cualquier perfil como dueño de la ficha)
  select id into v_dueno from public.profiles limit 1;

  if v_cuenta is null or v_dueno is null then
    raise exception 'No hay ni cuentas ni perfiles con los que probar.';
  end if;

  ---------------------------------------------------------------------------
  -- 0) Alta con un enlace que SÍ encaja: se conserva.
  insert into public.clients (user_id, name, email, portal_user_id)
    values (v_dueno, 'PRUEBA enlace portal', v_correo, v_cuenta)
    returning id, portal_user_id into v_ficha, v_visto;

  if v_visto is not distinct from v_cuenta then
    v_resultado := v_resultado || E'\n  OK    0) alta con enlace correcto -> se conserva';
  else
    v_resultado := v_resultado || E'\n  FALLA 0) alta con enlace correcto -> se ha borrado';
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 1) Alta con un enlace inventado (correo que no es el de la cuenta).
  declare v_otra uuid;
  begin
    insert into public.clients (user_id, name, email, portal_user_id)
      values (v_dueno, 'PRUEBA enlace falso', 'nadie-' || gen_random_uuid() || '@ejemplo.com', v_cuenta)
      returning portal_user_id into v_otra;

    if v_otra is null then
      v_resultado := v_resultado || E'\n  OK    1) alta con enlace falso -> desenlazado';
    else
      v_resultado := v_resultado || E'\n  FALLA 1) alta con enlace falso -> SE HA COLADO';
      v_fallos := v_fallos + 1;
    end if;
  end;

  ---------------------------------------------------------------------------
  -- 2) El freelancer cambia el correo de la ficha: el enlace se corta.
  update public.clients set email = 'cambiado@ejemplo.com' where id = v_ficha;
  select portal_user_id into v_visto from public.clients where id = v_ficha;

  if v_visto is null then
    v_resultado := v_resultado || E'\n  OK    2) cambia el correo -> desenlazado';
  else
    v_resultado := v_resultado || E'\n  FALLA 2) cambia el correo -> EL ENLACE VIEJO SIGUE VIVO';
    v_fallos := v_fallos + 1;
  end if;

  -- se deja la ficha coherente otra vez
  update public.clients set email = v_correo where id = v_ficha;
  update public.clients set portal_user_id = v_cuenta where id = v_ficha;

  ---------------------------------------------------------------------------
  -- 3) Cambia cualquier otra cosa: el enlace no se toca.
  update public.clients set name = 'PRUEBA renombrada' where id = v_ficha;
  select portal_user_id into v_visto from public.clients where id = v_ficha;

  if v_visto is not distinct from v_cuenta then
    v_resultado := v_resultado || E'\n  OK    3) cambia el nombre -> el enlace se conserva';
  else
    v_resultado := v_resultado || E'\n  FALLA 3) cambia el nombre -> el enlace se ha perdido';
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 4) Correo nuevo y enlace viejo en el mismo UPDATE: pareja incoherente.
  update public.clients
     set email = 'otro@ejemplo.com', portal_user_id = v_cuenta
   where id = v_ficha;
  select portal_user_id into v_visto from public.clients where id = v_ficha;

  if v_visto is null then
    v_resultado := v_resultado || E'\n  OK    4) correo+enlace incoherentes -> desenlazado';
  else
    v_resultado := v_resultado || E'\n  FALLA 4) correo+enlace incoherentes -> SE HA COLADO';
    v_fallos := v_fallos + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 5) No queda ningún enlace obsoleto en la tabla de verdad.
  declare v_obsoletos int;
  begin
    select count(*) into v_obsoletos
      from public.clients c join auth.users u on u.id = c.portal_user_id
     where lower(c.email) is distinct from lower(u.email);

    if v_obsoletos = 0 then
      v_resultado := v_resultado || E'\n  OK    5) no hay enlaces obsoletos en la tabla';
    else
      v_resultado := v_resultado || format(E'\n  FALLA 5) hay %s enlace(s) obsoleto(s) en la tabla', v_obsoletos);
      v_fallos := v_fallos + 1;
    end if;
  end;

  ---------------------------------------------------------------------------
  raise exception E'ENLACE DEL PORTAL — % fallo(s)\n%\n\n(la transaccion se ha deshecho: no queda nada de esta prueba)',
    v_fallos, v_resultado;
end $$;
