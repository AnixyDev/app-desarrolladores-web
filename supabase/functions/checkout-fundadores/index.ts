// Pago del Plan Fundadores (Freelancer Pro, 59 €/año para siempre).
//
// Va aparte de create-checkout-session para no tocar el flujo de los planes
// actuales, pero sigue su mismo patrón: el navegador no decide nada. Precio,
// modo, metadata y usuario los pone el servidor.
//
// Antes de crear el pago se comprueba EN EL SERVIDOR, en este momento y sin
// cache:
//   1. que la oferta no ha cerrado (31/12/2026 23:59, hora de Madrid);
//   2. que el usuario no tiene ya una suscripción (no se le cobraría dos veces);
//   3. que queda plaza: 50 − suscripciones de fundadores − pagos de
//      fundadores abiertos. Cada pago abierto reserva su plaza durante 31
//      minutos; si no se completa, Stripe lo caduca y la plaza se libera.
// Si el mismo usuario vuelve a pulsar con un pago suyo aún abierto, se le
// devuelve ese mismo pago en vez de reservar otra plaza.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import {
  DURACION_RESERVA_SEG,
  ITEM_KEY_FUNDADORES,
  estadoFundadores,
  ofertaAbierta,
} from "../_shared/fundadores.ts";

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

// Mismo criterio que create-checkout-session.
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

// Estados con los que el usuario ya tiene un plan de pago: no puede contratar
// además el de fundadores. 'incomplete' no cuenta: es un intento de pago
// fallido que Stripe caduca solo, y bloquearía al usuario hasta un día.
const ESTADOS_CON_SUSCRIPCION = new Set(["active", "trialing", "past_due", "unpaid"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Inicia sesión para continuar." }, 401);

    const ahora = new Date();

    // 1) Fecha límite.
    if (!ofertaAbierta(ahora)) {
      return json({ error: "La oferta de fundadores terminó el 31/12/2026." }, 410);
    }

    // 2) Sin suscripción previa. Se mira el perfil y, si tiene cliente en
    //    Stripe, también Stripe (el perfil depende del webhook).
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, full_name, subscription_status")
      .eq("id", user.id)
      .single();

    const yaSuscritoMsg =
      "Ya tienes una suscripción activa. La oferta de fundadores es solo para nuevas suscripciones.";
    if (ESTADOS_CON_SUSCRIPCION.has(profile?.subscription_status ?? "")) {
      return json({ error: yaSuscritoMsg }, 409);
    }

    let customerId: string | null = profile?.stripe_customer_id ?? null;
    if (customerId) {
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      if (subs.data.some((s) => ESTADOS_CON_SUSCRIPCION.has(s.status))) {
        return json({ error: yaSuscritoMsg }, 409);
      }
    }

    // 3) Plazas, contadas ahora mismo en Stripe (sin cache).
    const estado = await estadoFundadores(stripe, ahora);
    if (!estado.precioId) {
      console.error("[checkout-fundadores] no hay precio activo con la lookup key de fundadores");
      return json({ error: "La oferta de fundadores no está disponible ahora mismo." }, 503);
    }

    // Si este usuario ya tiene su pago de fundadores abierto, se le devuelve
    // el mismo: no ocupa una segunda plaza.
    const propia = estado.reservas.find((s) => s.metadata?.supabase_user_id === user.id);
    if (propia) {
      const url = propia.url ?? (await stripe.checkout.sessions.retrieve(propia.id)).url;
      if (url) return json({ url });
    }

    if (estado.restantes <= 0) {
      return json({ error: "Ya no quedan plazas de fundador." }, 409);
    }

    const origin = origenSeguro(req.headers.get("Origin"));

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: profile?.full_name || user.user_metadata?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: estado.precioId, quantity: 1 }],
      success_url: `${origin}/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?payment=cancelled`,
      // La reserva de la plaza dura lo que dura este pago.
      expires_at: Math.floor(ahora.getTime() / 1000) + DURACION_RESERVA_SEG,
      metadata: {
        supabase_user_id: user.id,
        itemKey: ITEM_KEY_FUNDADORES,
      },
      // Sin códigos promocionales: el precio de fundadores ya es el descuento.
      allow_promotion_codes: false,
    });

    return json({ url: session.url });
  } catch (error) {
    console.error("[checkout-fundadores] error:", error);
    return json({ error: "No se pudo iniciar el pago. Inténtalo de nuevo." }, 500);
  }
});
