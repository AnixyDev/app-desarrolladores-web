-- Lead Hunter PRO (04/10/2026): la LSSI (art. 21) prohíbe enviar comunicaciones
-- comerciales por email, WhatsApp, SMS u otro medio electrónico a quien no las
-- ha pedido o autorizado antes, también a empresas. Desde ahora solo se puede
-- escribir por esos medios a un negocio cuyo permiso conste aquí, y nunca a una
-- dirección que se haya dado de baja.

alter table public.businesses
  add column if not exists email_consent_at timestamptz,
  add column if not exists email_consent_source text,
  add column if not exists email_consent_note text;

alter table public.businesses drop constraint if exists businesses_email_consent_source_check;
alter table public.businesses add constraint businesses_email_consent_source_check
  check (email_consent_source is null or email_consent_source in
    ('respondio', 'pidio_informacion', 'llamada', 'reunion', 'cliente_previo'));

-- Sin fecha no hay permiso: la fecha y el origen van juntos.
alter table public.businesses drop constraint if exists businesses_email_consent_completo;
alter table public.businesses add constraint businesses_email_consent_completo
  check ((email_consent_at is null) = (email_consent_source is null));

comment on column public.businesses.email_consent_at is
  'Cuándo autorizó el negocio recibir mensajes comerciales por email/WhatsApp. NULL = no autorizado: el servidor no envía.';
comment on column public.businesses.email_consent_source is
  'Cómo se obtuvo el permiso: respondio, pidio_informacion, llamada, reunion, cliente_previo.';

-- Lista de bajas COMÚN a todas las cuentas: quien se da de baja u se opone no
-- vuelve a recibir nada de ningún usuario de Lead Hunter.
create table if not exists public.lead_email_bajas (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  motivo text not null default 'baja' check (motivo in ('baja', 'oposicion', 'supresion')),
  created_at timestamptz not null default now()
);

alter table public.lead_email_bajas enable row level security;
-- Sin políticas: solo la clave de servicio (servidor de Lead Hunter) la lee y escribe.
revoke all on public.lead_email_bajas from anon, authenticated;

comment on table public.lead_email_bajas is
  'Emails que no quieren recibir comunicaciones comerciales de Lead Hunter PRO. El servidor la consulta antes de cada envío.';
