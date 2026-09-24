-- Ítem 8 del roadmap: marketplace de plantillas entre freelancers.
-- Añade los campos de venta a las 3 tablas de plantillas ya existentes
-- (hasta ahora solo eran personales) sin romper nada de lo que ya había.

ALTER TABLE public.proposal_templates
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS downloads_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS downloads_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS downloads_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.proposal_templates.is_public IS 'Ítem 8 roadmap: listada en el marketplace de plantillas entre freelancers.';
COMMENT ON COLUMN public.contract_templates.is_public IS 'Ítem 8 roadmap: listada en el marketplace de plantillas entre freelancers.';
COMMENT ON COLUMN public.invoice_templates.is_public IS 'Ítem 8 roadmap: listada en el marketplace de plantillas entre freelancers.';

-- Registro de compras. No es FK formal a las 3 tablas de plantillas (una
-- compra puede ser de cualquiera de los 3 tipos) — se valida en la
-- Edge Function, no en la BD, por eso template_type + template_id sueltos.
CREATE TABLE IF NOT EXISTS public.template_purchases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('proposal','contract','invoice')),
  original_template_id uuid NOT NULL,
  copied_template_id uuid NOT NULL,
  price_cents integer NOT NULL,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_purchases" ON public.template_purchases
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Nada de INSERT/UPDATE/DELETE por RLS para el cliente: las compras solo
-- las crea el webhook de Stripe con el service role, nunca directamente
-- desde el navegador (evita que alguien se "regale" una compra falsa).

-- Vistas públicas de solo metadatos — NUNCA exponen el contenido real de
-- la plantilla (content_template/title_template/items). Es la barrera de
-- seguridad real contra "ver gratis sin comprar": el contenido completo
-- solo se entrega tras verificar el pago en el webhook (service role).
CREATE OR REPLACE VIEW public.proposal_templates_marketplace AS
  SELECT pt.id, pt.user_id AS seller_id, pt.name, pt.description, pt.category,
         pt.price_cents, pt.downloads_count, pt.created_at,
         p.business_name, p.full_name
  FROM public.proposal_templates pt
  JOIN public.profiles p ON p.id = pt.user_id
  WHERE pt.is_public = true;

CREATE OR REPLACE VIEW public.contract_templates_marketplace AS
  SELECT ct.id, ct.user_id AS seller_id, ct.name, ct.description, ct.category,
         ct.price_cents, ct.downloads_count, ct.created_at,
         p.business_name, p.full_name
  FROM public.contract_templates ct
  JOIN public.profiles p ON p.id = ct.user_id
  WHERE ct.is_public = true;

CREATE OR REPLACE VIEW public.invoice_templates_marketplace AS
  SELECT it.id, it.user_id AS seller_id, it.name, it.description, it.category,
         it.price_cents, it.downloads_count, it.created_at,
         p.business_name, p.full_name
  FROM public.invoice_templates it
  JOIN public.profiles p ON p.id = it.user_id
  WHERE it.is_public = true;

GRANT SELECT ON public.proposal_templates_marketplace TO authenticated;
GRANT SELECT ON public.contract_templates_marketplace TO authenticated;
GRANT SELECT ON public.invoice_templates_marketplace TO authenticated;;
