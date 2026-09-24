-- FUGA: las tres vistas del marketplace son SECURITY DEFINER (necesario: sin
-- eso nadie veria las plantillas publicas de otros, porque la unica politica
-- SELECT de las tablas base es "auth.uid() = user_id"). Pero estaban
-- concedidas a anon, asi que un visitante SIN SESION, con la clave publica que
-- viaja en el JS, podia leer el UUID del vendedor, su nombre comercial y su
-- NOMBRE COMPLETO — datos que la RLS de profiles prohibe expresamente.
-- Comprobado en produccion antes de este cambio.
--
-- El marketplace vive en /template-marketplace, dentro de las rutas protegidas:
-- anon no lo necesita. Se le retira todo.
revoke all on public.contract_templates_marketplace from anon;
revoke all on public.invoice_templates_marketplace  from anon;
revoke all on public.proposal_templates_marketplace from anon;

-- Ademas tenian concedidos INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES a
-- anon y a authenticated. Son vistas con JOIN, no actualizables, asi que
-- Postgres rechazaria la escritura igualmente — pero no pintan nada ahi.
revoke all on public.contract_templates_marketplace from authenticated;
revoke all on public.invoice_templates_marketplace  from authenticated;
revoke all on public.proposal_templates_marketplace from authenticated;

grant select on public.contract_templates_marketplace to authenticated;
grant select on public.invoice_templates_marketplace  to authenticated;
grant select on public.proposal_templates_marketplace to authenticated;

-- Nota: se MANTIENE security definer a proposito. Es una proyeccion publica y
-- curada (solo is_public = true, y solo nombre/precio/descargas del vendedor).
-- Pasarlas a security_invoker dejaria el marketplace vacio, y la alternativa
-- -- una politica en profiles que exponga a los vendedores -- expondria la
-- FILA ENTERA del perfil (email, NIF, direccion fiscal), que es mucho peor.;
