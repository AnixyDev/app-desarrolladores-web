import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { articulo, esComprablePorCheckout } from "../_shared/catalogo-stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ORIGEN_POR_DEFECTO = "https://devfreelancer.app";
const ORIGENES_PERMITIDOS = [
  "https://devfreelancer.app",
  "https://www.devfreelancer.app",
];

/**
 * El origen para las URL de vuelta salia de `metadata.origin`, es decir, del
 * navegador. Ahora se toma de la cabecera Origin y solo si es uno nuestro.
 */
function origenSeguro(origen: string | null): string {
  if (!origen) return ORIGEN_POR_DEFECTO;
  try {
    const parsed = new URL(origen);
    if (parsed.protocol === "http:" && parsed.hostname === "localhost") return parsed.origin;
    if (parsed.protocol === "https:" && ORIGENES_PERMITIDOS.includes(parsed.origin)) {
      return parsed.origin;
    }
  } catch { /* origen ilegible */ }
  return ORIGEN_POR_DEFECTO;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
      return json({ error: "No autorizado" }, 401);
    }

    const body = await req.json();

    // ------------------------------------------------------------------
    // TODO lo que decide QUE se compra y CUANTO cuesta sale del catalogo
    // del servidor. Del cuerpo de la peticion solo se lee el itemKey y dos
    // referencias que no afectan al precio.
    //
    // Antes se aceptaban `priceId`, `mode`, `amount` y el `metadata` entero.
    // Como el webhook concede plan y creditos mirando metadata.itemKey y
    // metadata.credits, sin comprobar el importe, un usuario registrado podia
    // pagar 1 centimo por el plan Teams o por un millon de creditos. Y como
    // el metadata del cliente se esparcia DESPUES de supabase_user_id, tambien
    // podia ponerlo a nombre de otra persona.
    // ------------------------------------------------------------------
    const itemKey = String(body?.itemKey || "");
    if (!esComprablePorCheckout(itemKey)) {
      console.error(`[create-checkout-session] itemKey no valido: "${itemKey}" (usuario ${user.id})`);
      return json({ error: "El artículo de compra no es válido." }, 400);
    }

    const item = articulo(itemKey)!;

    // Referencias sin efecto sobre el precio. job_id se comprueba ademas
    // contra el usuario para no dejar destacar la oferta de otro.
    const jobId = body?.job_id ? String(body.job_id) : null;
    const clientReferenceId = body?.client_reference_id
      ? String(body.client_reference_id)
      : undefined;

    if (itemKey === "featuredJobPost") {
      if (!jobId) {
        return json({ error: "Falta la oferta que se quiere destacar." }, 400);
      }
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!job) {
        console.error(`[create-checkout-session] oferta ajena o inexistente: ${jobId} (usuario ${user.id})`);
        return json({ error: "Oferta no encontrada." }, 404);
      }
    }

    const origin = origenSeguro(req.headers.get("Origin"));

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, full_name")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name:
          profile?.full_name ||
          user.user_metadata?.full_name ||
          undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      customerId = customer.id;

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: item.mode,
      client_reference_id: clientReferenceId,

      line_items: [{ price: item.priceId!, quantity: 1 }],

      success_url: `${origin}/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?payment=cancelled`,

      // El metadata lo compone el servidor entero. El usuario es SIEMPRE el
      // del token, y los creditos salen del catalogo, no de la peticion.
      metadata: {
        supabase_user_id: user.id,
        itemKey,
        ...(item.credits !== undefined ? { credits: String(item.credits) } : {}),
        ...(jobId ? { job_id: jobId } : {}),
      },

      allow_promotion_codes: item.mode === "subscription",
    });

    return json({ url: session.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return json({ error: "No se pudo iniciar el pago. Inténtalo de nuevo." }, 400);
  }
});
