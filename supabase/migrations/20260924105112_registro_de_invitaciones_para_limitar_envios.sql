-- invite-team-member no tenia ningun tope: cualquier usuario podia enviar
-- invitaciones sin limite a direcciones arbitrarias, desde el dominio
-- verificado devfreelancer.app y la cuenta de Resend.
--
-- El limite por plan cuenta filas de team_members, que el usuario puede
-- borrar; sin este registro bastaria con anadir, invitar, borrar y repetir.
-- Aqui queda constancia de cada ENVIO, que no se puede deshacer borrando
-- al miembro.
create table if not exists public.invitaciones_enviadas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  enviada_en timestamptz not null default now()
);

create index if not exists invitaciones_enviadas_user_fecha_idx
  on public.invitaciones_enviadas (user_id, enviada_en desc);

-- RLS activo y SIN politicas a proposito: solo la clave de servicio, que se
-- salta RLS, escribe y lee aqui. Ningun usuario puede ver ni manipular su
-- propio registro de envios, que es justamente lo que lo hace util como tope.
alter table public.invitaciones_enviadas enable row level security;

revoke all on public.invitaciones_enviadas from anon, authenticated;

comment on table public.invitaciones_enviadas is
  'Registro de invitaciones de equipo enviadas. Solo service_role. Sirve de tope diario (ver _shared/limites-equipo.ts); no se puede evadir borrando filas de team_members.';;
