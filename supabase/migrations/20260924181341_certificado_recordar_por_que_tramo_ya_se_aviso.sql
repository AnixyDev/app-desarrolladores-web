-- El aviso de caducidad del certificado digital se manda por tramos (60, 30,
-- 7 dias y el propio vencimiento). Sin recordar por cual se aviso ya, el
-- correo saldria todos los dias desde el dia 60: un aviso diario se ignora a
-- la tercera y deja de servir para nada.
--
-- `veri_factu_cert_alert_para` guarda la fecha de caducidad a la que se
-- refiere el aviso. Si el usuario sube un certificado nuevo, esa fecha cambia
-- y el contador vuelve a empezar solo, sin necesidad de borrar nada.
alter table public.user_secrets
  add column if not exists veri_factu_cert_alert_tramo smallint,
  add column if not exists veri_factu_cert_alert_para date;

comment on column public.user_secrets.veri_factu_cert_alert_tramo is
  'Ultimo tramo de aviso enviado por caducidad del certificado: 60, 30, 7 o 0 (ya caducado). NULL = ninguno.';

comment on column public.user_secrets.veri_factu_cert_alert_para is
  'Fecha de caducidad a la que corresponde veri_factu_cert_alert_tramo. Si no coincide con veri_factu_cert_expires_at, el certificado es otro y el aviso se reinicia.';
