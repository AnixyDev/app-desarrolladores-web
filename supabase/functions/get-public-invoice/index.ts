// supabase/functions/get-public-invoice/index.ts
//
// Página pública de pago de facturas (sin login del cliente). El ID de la
// factura (UUID) hace de "contraseña" — igual que los enlaces de pago o
// facturas hospedadas de Stripe: imposible de adivinar, y es lo único que
// hace falta para ver y pagar ESA factura concreta.
//
// Usa el service role para saltarse RLS (intencionadamente: esto es
// público por diseño), pero solo devuelve el subconjunto de columnas
// necesario para pagar — nunca el email/NIF del cliente, notas internas,
// ni nada de otras facturas.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'Falta invoice_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, issue_date, due_date, items, subtotal_cents, tax_percent, total_cents, paid, user_id, client_id')
      .eq('id', invoice_id)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: 'Factura no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: freelancer }, { data: client }, { data: payments }] = await Promise.all([
      supabaseAdmin.from('profiles').select('business_name, full_name, pdf_color').eq('id', invoice.user_id).maybeSingle(),
      supabaseAdmin.from('clients').select('name, company').eq('id', invoice.client_id).maybeSingle(),
      supabaseAdmin.from('payments').select('amount_cents').eq('invoice_id', invoice.id),
    ]);

    const paidCents = (payments ?? []).reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

    return new Response(
      JSON.stringify({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date,
        items: invoice.items,
        subtotal_cents: invoice.subtotal_cents,
        tax_percent: invoice.tax_percent,
        total_cents: invoice.total_cents,
        paid: invoice.paid,
        paid_cents: paidCents,
        remaining_cents: Math.max(0, invoice.total_cents - paidCents),
        business_name: freelancer?.business_name || freelancer?.full_name || 'DevFreelancer',
        brand_color: freelancer?.pdf_color || null,
        client_name: client?.company || client?.name || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('get-public-invoice error:', error);
    return new Response(JSON.stringify({ error: String((error as any)?.message || error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
