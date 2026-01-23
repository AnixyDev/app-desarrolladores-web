import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Configuración moderna de Stripe para Edge Functions
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    })

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('No autorizado')

    const body = await req.json()
    const { priceId, mode, amount, productName, metadata } = body
    
    // Captura dinámica del origen desde los headers
    const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://devfreelancer.app'

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile?.full_name || user.user_metadata?.full_name,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      
      const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: priceId ? [{ price: priceId, quantity: 1 }] : [{
        price_data: {
            currency: 'eur',
            product_data: { name: productName || 'Pago DevFreelancer' },
            unit_amount: amount,
        },
        quantity: 1,
      }],
      mode,
      success_url: `${origin}/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?payment=cancelled`,
      metadata: { supabase_user_id: user.id, ...metadata },
      allow_promotion_codes: mode === 'subscription',
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})