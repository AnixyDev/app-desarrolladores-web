import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

declare const Deno: any;

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Ítem 4 del roadmap de monetización — Fase 2. Comisión que se queda la
// plataforma cuando el pago es de un cliente hacia un freelancer con cuenta
// de Stripe Connect verificada (destination charge). Ajusta este único
// número si cambia la comisión acordada.
const PLATFORM_FEE_PERCENT = 3

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { amount, description, metadata } = await req.json()

    // Optional: Get user to attach to customer, or create guest customer
    const { data: { user } } = await supabaseClient.auth.getUser()
    
    let customerId;
    if (user) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('stripe_customer_id')
          .eq('id', user.id)
          .single()
        customerId = profile?.stripe_customer_id;
    }

    // NUEVO: si este pago es de una factura (metadata.invoice_id) y el
    // freelancer dueño de esa factura tiene su cuenta de Stripe Connect
    // verificada, el cobro se divide automáticamente: el freelancer recibe
    // el importe menos la comisión de la plataforma, sin que nadie tenga
    // que hacer una transferencia manual después. Se resuelve con el
    // cliente de service role porque quien paga (el cliente del portal) no
    // tiene por qué tener permiso de lectura sobre el perfil del
    // freelancer.
    let connectParams: Record<string, unknown> = {}

    if (metadata?.invoice_id) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('user_id')
        .eq('id', metadata.invoice_id)
        .maybeSingle()

      if (invoice?.user_id) {
        const { data: freelancerProfile } = await supabaseAdmin
          .from('profiles')
          .select('stripe_account_id, stripe_onboarding_complete')
          .eq('id', invoice.user_id)
          .maybeSingle()

        if (freelancerProfile?.stripe_account_id && freelancerProfile.stripe_onboarding_complete) {
          connectParams = {
            application_fee_amount: Math.round(Number(amount) * (PLATFORM_FEE_PERCENT / 100)),
            transfer_data: {
              destination: freelancerProfile.stripe_account_id,
            },
          }
        }
        // Si el freelancer no está verificado todavía, se sigue cobrando
        // en la cuenta de la plataforma como hasta ahora (comportamiento
        // sin cambios) — no bloqueamos el pago del cliente por eso.
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'eur',
      description: description,
      customer: customerId,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
          supabase_user_id: user?.id,
          ...metadata
      },
      ...connectParams,
    })

    return new Response(
      JSON.stringify({ paymentIntentClientSecret: paymentIntent.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
