-- El Portal de Cliente estaba construido entero — proyectos, facturas,
-- presupuestos, contratos, propuestas y el chat — y no habia ninguna forma de
-- que un cliente se enterase de que existia: ni funcion, ni boton, ni correo.
-- La unica via era decirselo a mano.
--
-- Esta columna sostiene las tres cosas que hacen falta para arreglarlo:
--   1. El dato que ve el freelancer en la ficha ("invitado el 24/09").
--   2. El contador del tope diario de invitaciones (se cuentan las filas
--      propias con fecha en las ultimas 24 h).
--   3. La espera entre reenvios al mismo cliente, que el tope diario no
--      cubre porque reinvitar actualiza la fila en vez de anadir otra.
--
-- Se prefiere una columna aqui a una tabla de registro aparte porque el dato
-- lo necesita la interfaz de todas formas, y porque asi no hay que tocar
-- `invitaciones_enviadas`, que ya usa `invite-team-member` en produccion.

alter table public.clients
  add column if not exists portal_invitado_en timestamptz;

comment on column public.clients.portal_invitado_en is
  'Cuando se envio la ultima invitacion al Portal de Cliente. La escribe solo la Edge Function invite-portal-client con la clave de servicio; sirve ademas de contador para el tope diario y para la espera entre reenvios.';

-- Para contar las invitaciones de las ultimas 24 horas de un usuario sin
-- recorrer toda su lista de clientes.
create index if not exists clients_portal_invitado_en_idx
  on public.clients (user_id, portal_invitado_en)
  where portal_invitado_en is not null;
