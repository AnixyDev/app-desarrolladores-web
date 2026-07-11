// Archivo: supabase/functions/create-portal-session/index.ts
//
// SINCRONIZADO desde la versión realmente desplegada en Supabase, que estaba
// desactualizada en el repo (alguien la desplegó directo desde el dashboard
// sin subir el cambio a GitHub). Esta es la que de verdad corre en producción.

import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16',
});

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const authHeader = req.headers.get('Authorization') || '';

    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Acceso no autorizado' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const { data: userAuth, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !userAuth.user) {
        return new Response(JSON.stringify({ error: 'Fallo al autenticar al usuario' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const userId = userAuth.user.id;

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

    if (profileError || !profile?.stripe_customer_id) {
        console.error('Error al buscar perfil o Stripe ID:', profileError);
        return new Response(JSON.stringify({ error: 'No se encontro el ID de cliente de Stripe' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const stripeCustomerId = profile.stripe_customer_id;

    try {
        const returnUrl = req.headers.get('Referer') || 'https://devfreelancer.app/settings';

        const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: returnUrl,
        });

        return new Response(
            JSON.stringify({ url: session.url }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error al crear la sesion del portal:', error);
        return new Response(
            JSON.stringify({ error: 'Error interno al crear el portal de facturacion.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});