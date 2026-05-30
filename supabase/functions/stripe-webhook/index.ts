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
    // En entornos Edge (como Deno/Supabase), se DEBE usar constructEventAsync
    // porque la API de criptografía Web Crypto es asíncrona.
    event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret!)
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`)
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
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        const clientReferenceId = session.client_reference_id // El ref_id del afiliado
        
        if (userId) {
          // 1. Actualizar créditos/plan del usuario según el itemKey en metadata
          const itemKey = session.metadata?.itemKey
          if (itemKey === 'proPlan') {
            await supabase.from('profiles').update({ plan: 'Pro', ai_credits: 50 }).eq('id', userId)
          } else if (itemKey?.startsWith('aiCredits')) {
            const creditsToAdd = parseInt(session.metadata?.credits || '0')
            const { data: profile } = await supabase.from('profiles').select('ai_credits').eq('id', userId).single()
            if (profile) {
              await supabase.from('profiles').update({ ai_credits: (profile.ai_credits || 0) + creditsToAdd }).eq('id', userId)
            }
          }

          // 2. Procesar comisión si hay un clientReferenceId (afiliado)
          if (clientReferenceId && session.amount_total) {
            // Buscamos al afiliado por su código
            const { data: affiliate } = await supabase
              .from('profiles')
              .select('id')
              .eq('affiliate_code', clientReferenceId)
              .single()

            if (affiliate) {
              const commissionCents = Math.round(session.amount_total * 0.20) // 20% de comisión
              await supabase.from('referrals').insert({
                affiliate_id: affiliate.id,
                referred_id: userId,
                amount_cents: commissionCents,
                status: 'Subscribed',
                stripe_session_id: session.id
              })
            }
          }
        }
        break;
      }
    }

    // Registrar evento como procesado exitosamente
    const { error: insertError } = await supabase.from('processed_stripe_events').insert({ 
      event_id: event.id, 
      type: event.type 
    })

    if (insertError) {
      console.error(`❌ Error saving processed event to DB:`, insertError)
      // No fallamos el webhook si solo falló el registro de idempotencia,
      // pero lo registramos en los logs.
    }

    console.log(`✅ Successfully processed webhook event: ${event.id} of type ${event.type}`)
    return new Response(JSON.stringify({ received: true }), { status: 200 })

  } catch (error: any) {
    console.error(`❌ Webhook processing error for event ${event?.id || 'unknown'}:`, error)
    // Devolvemos 400 o 500 para que Stripe reintente el webhook más tarde
    return new Response(JSON.stringify({ error: 'Internal Error', details: error.message }), { status: 500 })
  }
})