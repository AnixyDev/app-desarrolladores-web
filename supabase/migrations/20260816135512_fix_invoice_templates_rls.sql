-- CAMBIO: la política anterior "Enable read access for all users" (USING true)
-- dejaba leer las plantillas de factura de CUALQUIER usuario a cualquier otro
-- usuario autenticado — un fallo de privacidad real, encontrado en auditoría
-- de RLS. Se sustituye por acceso solo al propietario, y se añaden las
-- políticas de INSERT/UPDATE/DELETE que faltaban por completo (la tabla
-- solo tenía esa única política pública de lectura).

DROP POLICY IF EXISTS "Enable read access for all users" ON public.invoice_templates;

CREATE POLICY "invoice_templates_select_own"
  ON public.invoice_templates
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "invoice_templates_insert_own"
  ON public.invoice_templates
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "invoice_templates_update_own"
  ON public.invoice_templates
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "invoice_templates_delete_own"
  ON public.invoice_templates
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);
;
