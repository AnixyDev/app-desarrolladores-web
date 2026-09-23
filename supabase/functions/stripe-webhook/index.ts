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
// CAMBIO (subida de precios, ago 2026): se AÑADEN los price_id nuevos sin
// quitar los antiguos. Los suscriptores que ya estaban en 3,95€/35,95€/295€
// siguen pagando esos importes y sus webhooks de renovación siguen
// trayendo esos price_id de siempre — si los quitáramos de estos sets,
// resolvePlanFromPriceId() devolvería null en su próxima renovación y
// perderían el plan reconocido. Solo se AÑADEN los nuevos para que los
// suscriptores nuevos (9,95€/99,95€/45,95€/395€) también resuelvan bien.
const PRO_PRICE_IDS = new Set([
  'price_1SOgUF8oC5awQy15dOEM5jGS', // Pro Plan (mensual, legado 3,95€ — suscriptores antiguos)
  'price_1U0juK8oC5awQy15YPiUjnn2', // Pro Plan (mensual, 9,95€)
  'price_1U0juP8oC5awQy15fzLhBWOd', // Pro Plan (anual, 99,95€ — nuevo)
])
const TEAMS_PRICE_IDS = new Set([
  'price_1SOggV8oC5awQy15YW1wAgcg', // Plan de equipos (mensual, legado 35,95€ — suscriptores antiguos)
  'price_1TqEIe8oC5awQy15hnNqSypf', // Plan de equipos (anual, legado 295€ — suscriptores antiguos)
  'price_1U0juV8oC5awQy15ATm0EYe4', // Plan de equipos (mensual, 45,95€)
  'price_1U0jub8oC5awQy15QXzf5Vgp', // Plan de equipos (anual, 395€)
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

  // 🛡️ IDEMPOTENCIA — RESERVA PREVIA
  //
  // CAMBIO: antes esto era un SELECT aqui y un INSERT al FINAL, despues de
  // procesar. Entre medias cabia todo el trabajo, asi que la clave primaria
  // de processed_stripe_events (event_id) no servia de candado:
  //   - Stripe reintenta cuando no recibe un 2xx. Si la funcion agota su
  //     tiempo DESPUES de sumar creditos pero antes de registrar el evento,
  //     el reintento lo procesa entero otra vez.
  //   - Dos entregas simultaneas del mismo evento pasaban las dos el SELECT.
  // Resultado: creditos sumados dos veces, referidos duplicados, plantillas
  // compradas dos veces.
  //
  // Ahora se RESERVA el evento antes de tocar nada. El INSERT es el candado:
  // si otro proceso ya lo reservo, falla con violacion de clave primaria
  // (23505) y aqui se responde 200 sin hacer nada. Si el procesamiento falla
  // mas adelante, la reserva se borra para que el reintento de Stripe pueda
  // rehacerlo (ver el catch del final).
  const { error: reservaError } = await supabase
    .from('processed_stripe_events')
    .insert({ event_id: event.id, type: event.type })

  if (reservaError) {
    if (reservaError.code === '23505') {
      console.log(`↩️ Evento ${event.id} ya reservado por otra ejecucion — se ignora`)
      return new Response(JSON.stringify({ duplicate: true }), { status: 200 })
    }
    // Cualquier otro error al reservar: no se procesa y se devuelve 500 para
    // que Stripe reintente. Procesar sin poder registrar el evento seria
    // peor: no habria forma de evitar el duplicado en el reintento.
    console.error('❌ No se pudo reservar el evento, se rechaza para que Stripe reintente:', reservaError)
    return new Response(JSON.stringify({ error: 'No se pudo reservar el evento' }), { status: 500 })
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
          // CAMBIO (creditos borrados al suscribirse): antes estas dos ramas
          // hacian `ai_credits: PRO_PLAN_WELCOME_CREDITS`, que ASIGNA en vez
          // de sumar. Si alguien compraba 500 creditos y despues se suscribia
          // a Pro, se quedaba con 50 — creditos pagados, perdidos.
          // La rama hermana (customer.subscription.updated, mas abajo) ya lo
          // hacia bien con Math.max y un comentario que dice justo esto; a
          // esta se le habia olvidado. Ahora usan el mismo criterio: los
          // creditos de bienvenida son un SUELO, nunca un techo.
          if (itemKey === 'proPlan' || itemKey === 'teamsPlan' || itemKey === 'teamsPlanYearly') {
            const esTeams = itemKey !== 'proPlan'
            const bienvenida = esTeams ? TEAMS_PLAN_WELCOME_CREDITS : PRO_PLAN_WELCOME_CREDITS
            const { data: profile } = await supabase
              .from('profiles').select('ai_credits').eq('id', userId).maybeSingle()
            await supabase.from('profiles').update({
              plan: esTeams ? 'Teams' : 'Pro',
              ai_credits: Math.max(profile?.ai_credits ?? 0, bienvenida),
            }).eq('id', userId)
          } else if (itemKey?.startsWith('aiCredits')) {
            // CAMBIO (suma no atomica): antes se leia ai_credits y despues se
            // escribia leido + n. Entre las dos cabia otra operacion y una de
            // las sumas se perdia. sumar_creditos() lo hace en una sola
            // sentencia SQL, con la fila bloqueada por Postgres.
            const creditsToAdd = parseInt(session.metadata?.credits || '0')
            if (creditsToAdd > 0) {
              const { error: creditError } = await supabase.rpc('sumar_creditos', {
                p_user_id: userId, p_ai: creditsToAdd, p_firma: 0,
              })
              // Si falla, se lanza: el catch de abajo libera la reserva y
              // Stripe reintenta. Tragarse este error significaria cobrar sin
              // entregar los creditos.
              if (creditError) throw new Error(`No se pudieron sumar ${creditsToAdd} creditos de IA: ${creditError.message}`)
            }
          } else if (itemKey?.startsWith('signatureCredits')) {
            // Ítem 5 del roadmap — paquetes de firma electrónica, mismo
            // patrón que aiCredits: se compran aparte, no caducan, y se
            // consumen uno a uno al enviar un documento a firmar.
            // CAMBIO: mismo motivo que arriba — suma atomica en vez de
            // leer-y-escribir.
            const creditsToAdd = parseInt(session.metadata?.credits || '0')
            if (creditsToAdd > 0) {
              const { error: creditError } = await supabase.rpc('sumar_creditos', {
                p_user_id: userId, p_ai: 0, p_firma: creditsToAdd,
              })
              if (creditError) throw new Error(`No se pudieron sumar ${creditsToAdd} creditos de firma: ${creditError.message}`)
            }
          } else if (itemKey === 'featuredJobPost') {
            // FIX: no existía. JobPostForm.tsx llamaba a este checkout sin
            // pasar ningún dato de la oferta y Stripe redirigía a /billing
            // — se cobraba dinero real y nunca se creaba ni destacaba
            // ninguna oferta. Ahora "Destacar" es una acción posterior
            // desde MyJobPostsPage.tsx sobre una oferta ya publicada, con
            // su job_id viajando en el metadata de la sesión. Se filtra
            // también por user_id como comprobación de que el job
            // pertenece a quien ha pagado.
            const jobId = session.metadata?.job_id
            if (jobId) {
              const { error: featureError } = await supabase
                .from('jobs')
                .update({ isfeatured: true })
                .eq('id', jobId)
                .eq('user_id', userId)

              if (featureError) {
                console.error(`⚠️ No se pudo destacar la oferta ${jobId}:`, featureError.message)
              }
            } else {
              console.error('⚠️ featuredJobPost sin job_id en el metadata de la sesión', session.id)
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
            .select('id, user_id, total_cents, paid')
            .eq('id', invoiceId)
            .maybeSingle()

          if (fetchErr || !invoice) {
            console.error(`⚠️ payment_intent.succeeded: factura ${invoiceId} no encontrada`, fetchErr?.message)
          } else {
            // FIX 1: el cobro no dejaba rastro en public.payments — solo se
            // marcaba invoices.paid. Por eso remaining_cents seguia mostrando
            // el total despues de pagar, y ni el historial del cliente ni las
            // previsiones veian el ingreso. Ahora se registra como un pago mas,
            // igual que los manuales y los del banco.
            //
            // El indice unico parcial sobre stripe_payment_intent_id hace de
            // candado: si Stripe reenvia el evento, el segundo insert falla con
            // 23505 y se ignora en vez de duplicar el cobro.
            const cobrado = paymentIntent.amount_received ?? 0

            const { error: pagoError } = await supabase.from('payments').insert({
              invoice_id: invoiceId,
              // Obligatorio: la columna tiene default auth.uid(), que con la
              // clave de servicio es NULL y violaria el NOT NULL.
              user_id: invoice.user_id,
              amount_cents: cobrado,
              paid_at: new Date().toISOString().split('T')[0],
              method: 'Stripe',
              stripe_payment_intent_id: paymentIntent.id,
            })

            if (pagoError && pagoError.code !== '23505') {
              console.error(
                `⚠️ payment_intent.succeeded: no se pudo registrar el pago de la factura ${invoiceId}:`,
                pagoError.message
              )
            }
            if (pagoError?.code === '23505') {
              console.log(`↩️ Pago ${paymentIntent.id} ya registrado — no se duplica`)
            }

            // FIX 2: antes se exigia que UN solo cobro fuese exactamente igual
            // al total de la factura. Pero la pagina publica cobra lo que queda
            // por pagar, asi que en cuanto habia un pago parcial registrado a
            // mano los numeros no coincidian nunca: el cliente pagaba el resto,
            // el dinero entraba, y la factura se quedaba en pendiente para
            // siempre con un console.error como unico rastro.
            // Ahora se mira la SUMA de los pagos registrados.
            if (!invoice.paid) {
              const { data: pagos, error: sumaError } = await supabase
                .from('payments')
                .select('amount_cents')
                .eq('invoice_id', invoiceId)

              if (sumaError) {
                console.error(
                  `⚠️ payment_intent.succeeded: no se pudo sumar los pagos de la factura ${invoiceId}:`,
                  sumaError.message
                )
              } else {
                const totalPagado = (pagos ?? []).reduce((s, p) => s + (p.amount_cents ?? 0), 0)

                if (totalPagado >= invoice.total_cents) {
                  await supabase.from('invoices').update({
                    paid: true,
                    payment_date: new Date().toISOString(),
                  }).eq('id', invoiceId)
                } else {
                  // Pago parcial legitimo: queda registrado y la factura sigue
                  // abierta por la diferencia. No es un error.
                  console.log(
                    `💶 Factura ${invoiceId}: pago parcial registrado ` +
                    `(${totalPagado} de ${invoice.total_cents})`
                  )
                }
              }
            }
          }
        }

        // NUEVO (ítem 8 del roadmap): compra de plantilla del marketplace.
        // El contenido real NUNCA se entrega hasta aquí — es la única
        // ruta que copia content_template/title_template/items al
        // comprador, y solo se ejecuta tras confirmar el cobro con
        // Stripe (nunca a petición directa del navegador).
        const templateType = paymentIntent.metadata?.template_type
        const templateId = paymentIntent.metadata?.template_id
        const buyerId = paymentIntent.metadata?.supabase_user_id

        if (templateType && templateId && buyerId) {
          const templateTable = `${templateType}_templates`

          // Idempotencia: si ya existe una compra para este PaymentIntent,
          // no se duplica la copia (reintentos del webhook).
          const { data: existingPurchase } = await supabase
            .from('template_purchases')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntent.id)
            .maybeSingle()

          if (!existingPurchase) {
            const { data: original, error: originalError } = await supabase
              .from(templateTable)
              .select('*')
              .eq('id', templateId)
              .maybeSingle()

            if (originalError || !original) {
              console.error(`⚠️ payment_intent.succeeded: plantilla ${templateType}/${templateId} no encontrada`, originalError?.message)
            } else {
              // Copia para el comprador: mismo contenido, nuevo dueño,
              // nunca pública por defecto (que decida él si la revende).
              const { id: _oldId, user_id: _oldOwner, is_public: _oldPublic,
                       downloads_count: _oldDownloads, created_at: _oldCreatedAt,
                       ...contentFields } = original as any

              const { data: copy, error: copyError } = await supabase
                .from(templateTable)
                .insert({ ...contentFields, user_id: buyerId, is_public: false, downloads_count: 0 })
                .select('id')
                .single()

              if (copyError || !copy) {
                console.error(`⚠️ payment_intent.succeeded: no se pudo copiar la plantilla al comprador`, copyError?.message)
              } else {
                await supabase.from('template_purchases').insert({
                  buyer_id: buyerId,
                  seller_id: original.user_id,
                  template_type: templateType,
                  original_template_id: templateId,
                  copied_template_id: copy.id,
                  price_cents: paymentIntent.amount_received,
                  stripe_payment_intent_id: paymentIntent.id,
                })

                await supabase
                  .from(templateTable)
                  .update({ downloads_count: (original.downloads_count || 0) + 1 })
                  .eq('id', templateId)
              }
            }
          }
        }
        break;
      }

      case 'account.updated': {
        // Ítem 4 del roadmap — Fase 1 (Stripe Connect). Stripe notifica cada
        // vez que cambia el estado de verificación (KYC) de una cuenta
        // conectada. Marcamos onboarding_complete cuando ya puede cobrar Y
        // recibir transferencias — antes de eso, sigue en revisión.
        const account = event.data.object as Stripe.Account
        const onboardingComplete = !!(account.charges_enabled && account.payouts_enabled)

        await supabase
          .from('profiles')
          .update({ stripe_onboarding_complete: onboardingComplete })
          .eq('stripe_account_id', account.id)
        break;
      }
    }

    // CAMBIO: el INSERT que habia aqui se ha movido ARRIBA, antes de procesar,
    // para que la clave primaria haga de candado. Aqui ya no hace falta.
    console.log(`✅ Successfully processed webhook event: ${event.id} of type ${event.type}`)
    return new Response(JSON.stringify({ received: true }), { status: 200 })

  } catch (error: any) {
    console.error(`❌ Webhook processing error for event ${event?.id || 'unknown'}:`, error)

    // CAMBIO: se libera la reserva. Sin esto, un fallo a mitad dejaria el
    // evento marcado como procesado para siempre y el reintento de Stripe se
    // descartaria como duplicado — perdiendo el cobro en silencio.
    // Nota: si el fallo ocurrio DESPUES de aplicar parte de los cambios, el
    // reintento repetira esa parte. Es el mal menor frente a perderla entera,
    // y las operaciones de plan usan Math.max, que es repetible sin dano.
    const { error: liberaError } = await supabase
      .from('processed_stripe_events')
      .delete()
      .eq('event_id', event.id)

    if (liberaError) {
      console.error(`❌ Ademas, no se pudo liberar la reserva de ${event.id}:`, liberaError)
    }

    return new Response(JSON.stringify({ error: 'Internal Error', details: error.message }), { status: 500 })
  }
})
