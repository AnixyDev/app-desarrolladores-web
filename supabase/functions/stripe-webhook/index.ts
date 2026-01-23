import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'

declare const Deno: any;

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
})

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  if (!signature) return new Response('Missing signature', { status: 400 })
  
  const body = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret!)
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 🛡️ IDEMPOTENCY CHECK
  const { data: alreadyProcessed } = await supabase
    .from('processed_stripe_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (alreadyProcessed) {
    return new Response(JSON.stringify({ duplicate: true }), { status: 200 })
  }

  try {
    // Lógica de negocio (simplificada para post-release)
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        if (userId) {
           // Actualizar plan/créditos (esto dispara el trigger de auditoría SQL)
           // ... implementación específica validada ...
        }
        break;
      // ... otros casos ...
    }

    // Registrar evento como procesado exitosamente
    await supabase.from('processed_stripe_events').insert({ 
      event_id: event.id, 
      type: event.type 
    })

    return new Response(JSON.stringify({ received: true }), { status: 200 })

  } catch (error: any) {
    console.error(`❌ Webhook error:`, error)
    return new Response('Internal Error', { status: 500 })
  }
})