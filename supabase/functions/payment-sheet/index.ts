
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
      }
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
