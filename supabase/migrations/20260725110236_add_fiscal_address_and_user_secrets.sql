-- Domicilio fiscal completo: nunca se implementó en la base de datos
-- aunque el tipo TypeScript ya lo prometía (Profile.address). Necesario
-- para que una factura sea legalmente completa (RD 1619/2012).
alter table public.profiles
  add column if not exists fiscal_street text,
  add column if not exists fiscal_postal_code text,
  add column if not exists fiscal_city text,
  add column if not exists fiscal_province text;

-- NUEVO: credenciales propias de cada usuario (API key de IA propia,
-- certificado digital para Veri*Factu). Todo cifrado — ni siquiera el
-- dueño de la fila puede leer el contenido descifrado directamente por
-- SQL/API normal; solo un Edge Function con la clave de cifrado (fuera de
-- la base de datos, en un secreto de servidor) puede leer/escribir el
-- valor real. La tabla solo expone metadatos (¿está configurado? ¿cuándo?).
create table public.user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_api_key_encrypted text,
  gemini_api_key_updated_at timestamptz,
  veri_factu_cert_storage_path text,
  veri_factu_cert_password_encrypted text,
  veri_factu_cert_subject text,
  veri_factu_cert_expires_at date,
  veri_factu_cert_uploaded_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_secrets enable row level security;

-- El dueño puede LEER su fila (para ver metadatos como fechas/estado),
-- pero no puede escribir directamente — todo insert/update pasa por el
-- Edge Function (service role), que es quien cifra de verdad antes de
-- guardar. Así el frontend nunca puede grabar un secreto "en plano" por
-- accidente ni bypasear el cifrado.
create policy "user_secrets_owner_select"
on public.user_secrets for select
to authenticated
using ((select auth.uid()) = user_id);

-- Bucket privado de Storage para los certificados digitales (.p12/.pfx).
insert into storage.buckets (id, name, public)
values ('fiscal-certificates', 'fiscal-certificates', false)
on conflict (id) do nothing;

create policy "fiscal_certificates_owner_access"
on storage.objects for all
to authenticated
using (bucket_id = 'fiscal-certificates' and (select auth.uid())::text = (storage.foldername(name))[1])
with check (bucket_id = 'fiscal-certificates' and (select auth.uid())::text = (storage.foldername(name))[1]);;
