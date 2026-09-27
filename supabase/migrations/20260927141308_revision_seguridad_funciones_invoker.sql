-- Los disparadores de la migración anterior se crearon SECURITY DEFINER, y
-- dentro de una función así current_user es su dueño (postgres), no quien
-- llama: la comprobación "current_user in ('anon','authenticated')" nunca se
-- cumplía y no frenaban nada (lo cazó la prueba
-- supabase/pruebas/revision-seguridad-funciones.sql). Pasan a SECURITY
-- INVOKER; lo que consultan (perfil propio, clientes/proyectos/equipo
-- propios) ya lo deja ver la RLS.
--
-- LECCIÓN: un disparador que decide según current_user NUNCA puede ser
-- SECURITY DEFINER.
alter function public.clients_proteger() security invoker;
alter function public.team_members_proteger() security invoker;
alter function public.exigir_referencias_propias() security invoker;
