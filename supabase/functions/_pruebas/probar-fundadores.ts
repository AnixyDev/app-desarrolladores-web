// Prueba del Plan Fundadores en MODO PRUEBA de Stripe, sin Docker ni la CLI de
// Supabase. Usa exactamente la misma lógica de plazas que las Edge Functions
// (supabase/functions/_shared/fundadores.ts) y crea el pago con los mismos
// parámetros que checkout-fundadores.
//
// No toca la base de datos de Supabase. Solo habla con Stripe en modo prueba.
//
// Uso (con Deno instalado):
//   export STRIPE_SECRET_KEY_TEST=sk_test_...
//   deno run --allow-net --allow-env supabase/functions/_pruebas/probar-fundadores.ts estado
//   deno run --allow-net --allow-env supabase/functions/_pruebas/probar-fundadores.ts pagar tu-correo@ejemplo.com
//   deno run --allow-net --allow-env supabase/functions/_pruebas/probar-fundadores.ts cancelar tu-correo@ejemplo.com

import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import {
  DURACION_RESERVA_SEG,
  ITEM_KEY_FUNDADORES,
  estadoFundadores,
} from "../_shared/fundadores.ts";

const clave = Deno.env.get("STRIPE_SECRET_KEY_TEST") ?? "";
if (!clave.startsWith("sk_test_")) {
  console.error("Pon tu clave de PRUEBA en STRIPE_SECRET_KEY_TEST (empieza por sk_test_). Nunca la real.");
  Deno.exit(1);
}
const stripe = new Stripe(clave, { apiVersion: "2023-10-16" });

const [orden, email] = Deno.args;

async function mostrarEstado() {
  const e = await estadoFundadores(stripe);
  if (!e.precioId) {
    console.log("❌ No hay ningún precio ACTIVO con la lookup key pro_anual_fundadores en modo prueba.");
    console.log("   Créalo en Stripe (modo prueba): producto Pro Plan, 59 €/año recurrente, lookup key pro_anual_fundadores.");
    return;
  }
  console.log(`Precio de fundadores: ${e.precioId}`);
  console.log(`Quedan ${e.restantes} de ${e.total} plazas · reservas abiertas: ${e.reservas.length} · disponible: ${e.disponible}`);
}

async function clienteDe(correo: string) {
  const existentes = await stripe.customers.list({ email: correo, limit: 1 });
  return existentes.data[0] ?? (await stripe.customers.create({ email: correo, metadata: { prueba: "fundadores" } }));
}

if (orden === "estado") {
  await mostrarEstado();
} else if (orden === "pagar" && email) {
  const e = await estadoFundadores(stripe);
  if (!e.precioId || !e.disponible) {
    await mostrarEstado();
    Deno.exit(1);
  }
  const cliente = await clienteDe(email);
  const sesion = await stripe.checkout.sessions.create({
    customer: cliente.id,
    mode: "subscription",
    line_items: [{ price: e.precioId, quantity: 1 }],
    success_url: "https://devfreelancer.app/billing?payment=success",
    cancel_url: "https://devfreelancer.app/billing?payment=cancelled",
    expires_at: Math.floor(Date.now() / 1000) + DURACION_RESERVA_SEG,
    metadata: { supabase_user_id: "prueba-local", itemKey: ITEM_KEY_FUNDADORES },
    allow_promotion_codes: false,
  });
  console.log("Abre este enlace y paga con la tarjeta 4242 4242 4242 4242 (fecha futura, CVC 123):");
  console.log(sesion.url);
  console.log("\nAntes de pagar, la plaza ya está reservada:");
  await mostrarEstado();
} else if (orden === "cancelar" && email) {
  const cliente = await clienteDe(email);
  const subs = await stripe.subscriptions.list({ customer: cliente.id, status: "active" });
  for (const s of subs.data) {
    await stripe.subscriptions.cancel(s.id);
    console.log(`Cancelada ${s.id}`);
  }
  await mostrarEstado();
} else {
  console.log("Órdenes: estado | pagar <correo> | cancelar <correo>");
}
