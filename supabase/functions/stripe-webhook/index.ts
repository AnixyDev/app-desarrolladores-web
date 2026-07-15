import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'

declare const Deno: any;

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
})

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

// Estados de Stripe que consideramos "suscripcion activa" a efectos de la app
const ACTIVE_STRIPE_STATUSES = new Set(['active', 'trialing'])

// Creditos de bienvenida que recibe cualquier suscripcion al activarse
const PRO_PLAN_WELCOME_CREDITS = 50
const TEAMS_PLAN_WELCOME_CREDITS = 200

// FIX: antes se asumia SIEMPRE plan: 'Pro' para cualquier suscripcion activa,
// sin mirar que price_id tenia contratado el cliente. Un cliente de "Plan de
// equipos" (35,95E/mes o 295E/ano) se guardaba como 'Pro' y recibia 50
// creditos en vez de los 200 prometidos en /billing. Estos sets mapean los
// price_id reales de Stripe (ver STRIPE_ITEMS en services/stripeService.ts)
// al plan correcto.
const PRO_PRICE_IDS = new Set([
  'price_1SOgUF8oC5awQy15dOEM5jGS', // Pro Plan (mensual)
])
const TEAMS_PRICE_IDS = new Set([
  'price_1SOggV8oC5awQy15YW1wAgcg', // Plan de equipos (mensual)
  'price_1TqEIe8oC5awQy15hnNqSypf', // Plan de equipos (anual)
])

function resolvePlanFromPriceId(priceId: string | undefined | null): 'Pro' | 'Teams' | null {
  if (!priceId) return null
  if (TEAMS_PRICE_IDS.has(priceId)) return 'Teams'
  if (PRO_PRICE_IDS.has(priceId)) return 'Pro'
  return null
}

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event: Stripe.Event

  try {
    // En entornos Edge (como Deno/Supabase), se DEBE usar constructEventAsync
    // porque la API de criptografia Web Crypto es asincrona.
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

  // Busca el perfil dueno de un customer de Stripe, ya sea por columna
  // stripe_customer_id o (fallback) por email del customer en Stripe.
  async function findUserIdByCustomer(customerId: string): Promise<string | null> {
    const { data: byCustomerId } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()

    if (byCustomerId) return byCustomerId.id

    const customer = await stripe.customers.retrieve(customerId)
    if (customer && !('deleted' in customer) && customer.email) {
      const { data: byEmail } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', customer.email)
        .maybeSingle()
      if (byEmail) return byEmail.id
    }
    return null
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        const clientReferenceId = session.client_reference_id

        if (userId) {
          const itemKey = session.metadata?.itemKey

          // FIX: se anaden los casos 'teamsPlan' y 'teamsPlanYearly', que
          // antes caian por defecto sin hacer nada aqui (solo se manejaba
          // 'proPlan' y 'aiCredits*'). Esto da feedback inmediato al
          // completar el checkout; el webhook de subscription.updated de
          // abajo actua como red de seguridad por si este evento llega
          // antes de que exista la suscripcion en Stripe.
          if (itemKey === 'proPlan') {
            await supabase.from('profiles').update({ plan: 'Pro', ai_credits: PRO_PLAN_WELCOME_CREDITS }).eq('id', userId)
          } else if (itemKey === 'teamsPlan' || itemKey === 'teamsPlanYearly') {
            await supabase.from('profiles').update({ plan: 'Teams', ai_credits: TEAMS_PLAN_WELCOME_CREDITS }).eq('id', userId)
          } else if (itemKey?.startsWith('aiCredits')) {
            const creditsToAdd = parseInt(session.metadata?.credits || '0')
            const { data: profile } = await supabase.from('profiles').select('ai_credits').eq('id', userId).single()
            if (profile) {
              await supabase.from('profiles').update({ ai_credits: (profile.ai_credits || 0) + creditsToAdd }).eq('id', userId)
            }
          }

          if (typeof session.customer === 'string') {
            await supabase.from('profiles').update({ stripe_customer_id: session.customer }).eq('id', userId)
          }

          if (clientReferenceId && session.amount_total) {
            const { data: affiliate } = await supabase
              .from('profiles')
              .select('id')
              .eq('affiliate_code', clientReferenceId)
              .single()

            if (affiliate) {
              const commissionCents = Math.round(session.amount_total * 0.20)
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

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const userId = await findUserIdByCustomer(customerId)

        if (userId) {
          const isActive = ACTIVE_STRIPE_STATUSES.has(subscription.status)

          // FIX: resolver el plan real (Pro vs Teams) mirando el price_id
          // de la suscripcion, en vez de asumir 'Pro' siempre.
          const priceId = subscription.items.data[0]?.price?.id
          const resolvedPlan = resolvePlanFromPriceId(priceId)

          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('subscription_status, ai_credits, plan')
            .eq('id', userId)
            .maybeSingle()

          const wasActive = currentProfile ? ACTIVE_STRIPE_STATUSES.has(currentProfile.subscription_status || '') : false

          const updates: Record<string, unknown> = {
            subscription_status: subscription.status,
            stripe_subscription_id: subscription.id,
            plan: isActive ? (resolvedPlan || currentProfile?.plan || 'Pro') : 'Free',
          }

          // Solo regalamos los creditos de bienvenida la primera vez que la
          // suscripcion pasa a estar activa (evita resetear creditos ya
          // comprados en cada actualizacion menor, ej. cambio de tarjeta).
          // El importe de bienvenida depende de si es Pro (50) o Teams (200).
          if (isActive && !wasActive) {
            const current = currentProfile?.ai_credits ?? 0
            const welcomeCredits = resolvedPlan === 'Teams' ? TEAMS_PLAN_WELCOME_CREDITS : PRO_PLAN_WELCOME_CREDITS
            updates.ai_credits = Math.max(current, welcomeCredits)
          }

          await supabase.from('profiles').update(updates).eq('id', userId)
        } else {
          console.error(`⚠️ No se encontro perfil para el customer ${customerId} (evento ${event.type})`)
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const userId = await findUserIdByCustomer(customerId)

        if (userId) {
          await supabase.from('profiles').update({
            subscription_status: 'canceled',
            plan: 'Free',
          }).eq('id', userId)
        }
        break;
      }

      // FIX: no existía ningún manejador para este evento. Los pagos de
      // factura desde el portal de cliente (Elements/PaymentIntent via la
      // función payment-sheet) nunca se reconciliaban aquí — la única
      // fuente de verdad era una llamada UPDATE hecha desde el propio
      // navegador del cliente, con su sesión sin privilegios, cuyo error
      // (si la RLS la rechazaba, o por cualquier fallo de red) se
      // ignoraba en silencio. Un cliente podía pagar de verdad en Stripe
      // y la factura quedarse "pendiente" para siempre sin que nadie se
      // enterase. Este handler usa el cliente con SERVICE_ROLE_KEY, que
      // no depende de RLS, como fuente de verdad autoritativa.
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const invoiceId = paymentIntent.metadata?.invoice_id

        if (invoiceId) {
          const { data: invoice, error: fetchErr } = await supabase
            .from('invoices')
            .select('id, total_cents, paid')
            .eq('id', invoiceId)
            .maybeSingle()

          if (fetchErr || !invoice) {
            console.error(`⚠️ payment_intent.succeeded: factura ${invoiceId} no encontrada`, fetchErr?.message)
          } else if (invoice.paid) {
            // Ya estaba marcada (p.ej. reintento del webhook) — no-op.
          } else if (invoice.total_cents !== paymentIntent.amount_received) {
            // Defensa en profundidad: el importe cobrado no coincide con
            // el total de la factura. No se marca como pagada
            // automáticamente; queda registrado para revisión manual.
            console.error(
              `⚠️ payment_intent.succeeded: importe no coincide para factura ${invoiceId} ` +
              `(factura=${invoice.total_cents}, cobrado=${paymentIntent.amount_received})`
            )
          } else {
            await supabase.from('invoices').update({
              paid: true,
              payment_date: new Date().toISOString(),
            }).eq('id', invoiceId)
          }
        }
        break;
      }
    }

    const { error: insertError } = await supabase.from('processed_stripe_events').insert({
      event_id: event.id,
      type: event.type
    })

    if (insertError) {
      console.error(`❌ Error saving processed event to DB:`, insertError)
    }

    console.log(`✅ Successfully processed webhook event: ${event.id} of type ${event.type}`)
    return new Response(JSON.stringify({ received: true }), { status: 200 })

  } catch (error: any) {
    console.error(`❌ Webhook processing error for event ${event?.id || 'unknown'}:`, error)
    return new Response(JSON.stringify({ error: 'Internal Error', details: error.message }), { status: 500 })
  }
})