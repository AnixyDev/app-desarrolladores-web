import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization") || "",
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Solo Pro/Teams: cobrar a los propios clientes es una función de pago,
    // mismo criterio que TaxLedgerPage/PortalBrandingPage/IntegrationsManager.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("plan, email, full_name, business_name, stripe_account_id, stripe_onboarding_complete")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("No se pudo cargar tu perfil.");
    }

    if (profile.plan === "Free") {
      return new Response(
        JSON.stringify({ error: "Esta función requiere un plan Pro o Teams." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const origin = "https://devfreelancer.app";

    // 1. Crear la cuenta conectada si el freelancer todavía no tiene una.
    let accountId = profile.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "ES",
        email: profile.email || user.email || undefined,
        business_type: "individual",
        business_profile: {
          name: profile.business_name || profile.full_name || undefined,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          supabase_user_id: user.id,
        },
      });

      accountId = account.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", user.id);
    }

    // 2. Generar el enlace de onboarding (KYC). Es de un solo uso y caduca
    // a los pocos minutos, así que se genera fresco en cada llamada — nunca
    // se guarda en la base de datos.
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/settings?tab=connect&refresh=true`,
      return_url: `${origin}/settings?tab=connect&onboarding=complete`,
      type: "account_onboarding",
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, account_id: accountId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // El error crudo de Stripe va al log; al navegador, un mensaje generico.
    console.error("Connect onboarding error:", error);
    return new Response(
      JSON.stringify({ error: "No se pudo iniciar la verificación de tu cuenta de cobro. Inténtalo de nuevo." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
