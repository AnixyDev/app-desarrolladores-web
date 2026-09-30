// supabase/functions/eliminar-cuenta/index.ts
//
// Baja de una cuenta (30/09/2026, a petición de Ana). La llama la página
// /cuenta/eliminar con la sesión del usuario y su email escrito como
// confirmación. En este orden, y parando en cuanto algo falla:
//
//   1. Cancela en Stripe sus suscripciones que aún puedan cobrar. Si Stripe
//      falla, NO se borra nada: una cuenta borrada con una suscripción viva
//      seguiría cobrando sin que nadie pudiera entrar a cancelarla.
//   2. eliminar_datos_de_cuenta(): archiva lo fiscal 4 años y borra lo demás
//      que no cuelga de una clave foránea.
//   3. Borra sus ficheros (logo, certificado, ficheros del portal).
//   4. Borra el usuario de Auth, que arrastra en cascada el perfil y todo lo
//      que cuelga de él.
//
// La cuenta de administración de la plataforma no se puede borrar desde aquí.
//
// RECUERDA: esta función NO se despliega con `git push`.

import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { confirmacionValida, hayQueCancelar, CUBOS_CON_FICHEROS_DE_LA_CUENTA } from '../_shared/eliminar-cuenta.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

/** Lista recursiva de los ficheros de una carpeta de un cubo. */
async function ficherosBajo(cubo: string, carpeta: string): Promise<string[]> {
  const rutas: string[] = [];
  const { data, error } = await supabaseAdmin.storage.from(cubo).list(carpeta, { limit: 1000 });
  if (error) throw new Error(`No se pudo listar ${cubo}/${carpeta}: ${error.message}`);
  for (const f of data ?? []) {
    const ruta = `${carpeta}/${f.name}`;
    if (f.id === null) rutas.push(...(await ficherosBajo(cubo, ruta))); // subcarpeta
    else rutas.push(ruta);
  }
  return rutas;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Acceso no autorizado' }, 401);
  const { data: auth, error: errorAuth } = await supabaseAdmin.auth.getUser(token);
  if (errorAuth || !auth.user) return json({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, 401);
  const uid = auth.user.id;

  let cuerpo: { confirmacion?: unknown } = {};
  try { cuerpo = await req.json(); } catch { /* cuerpo vacío */ }
  if (!confirmacionValida(cuerpo.confirmacion, auth.user.email)) {
    return json({ error: 'Escribe el email de tu cuenta para confirmar la baja.' }, 400);
  }

  const { data: perfil, error: errorPerfil } = await supabaseAdmin
    .from('profiles').select('role, stripe_customer_id').eq('id', uid).single();
  if (errorPerfil || !perfil) return json({ error: 'No se encontró tu cuenta.' }, 404);
  if (String(perfil.role ?? '').toLowerCase() === 'admin') {
    return json({ error: 'La cuenta de administración de la plataforma no se puede eliminar desde aquí.' }, 403);
  }

  // 1) Stripe: cancelar lo que aún pueda cobrar. Si falla, no se borra nada.
  let canceladas = 0;
  if (perfil.stripe_customer_id) {
    try {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
      const subs = await stripe.subscriptions.list({ customer: perfil.stripe_customer_id, status: 'all', limit: 100 });
      for (const s of subs.data) {
        if (hayQueCancelar(s.status)) {
          await stripe.subscriptions.cancel(s.id, { invoice_now: false, prorate: false });
          canceladas++;
        }
      }
    } catch (e) {
      // Cliente ya borrado en Stripe: no hay nada que pueda cobrar.
      const codigo = (e as { code?: string })?.code;
      if (codigo !== 'resource_missing') {
        console.error('[eliminar-cuenta] Stripe:', (e as Error)?.message ?? e);
        return json({ error: 'No se pudo cancelar tu suscripción. No se ha borrado nada; inténtalo de nuevo en unos minutos.' }, 502);
      }
    }
  }

  // 2) Datos: archivo fiscal y borrado de lo que no cae en cascada.
  const { data: resultado, error: errorDatos } = await supabaseAdmin.rpc('eliminar_datos_de_cuenta', { p_user: uid });
  if (errorDatos) {
    console.error('[eliminar-cuenta] eliminar_datos_de_cuenta:', errorDatos.message);
    return json({ error: 'No se pudieron borrar tus datos. Inténtalo de nuevo; si sigue fallando, escríbenos.' }, 500);
  }

  // 3) Ficheros. Un fallo aquí se registra y no para la baja.
  for (const cubo of CUBOS_CON_FICHEROS_DE_LA_CUENTA) {
    try {
      const rutas = await ficherosBajo(cubo, uid);
      for (let i = 0; i < rutas.length; i += 100) {
        const { error } = await supabaseAdmin.storage.from(cubo).remove(rutas.slice(i, i + 100));
        if (error) throw error;
      }
    } catch (e) {
      console.error(`[eliminar-cuenta] ficheros de ${cubo}:`, (e as Error)?.message ?? e);
    }
  }

  // 4) Usuario de Auth (arrastra el perfil y todo lo que cuelga de él).
  const { error: errorUsuario } = await supabaseAdmin.auth.admin.deleteUser(uid);
  if (errorUsuario) {
    console.error('[eliminar-cuenta] deleteUser:', errorUsuario.message);
    return json({ error: 'Tus datos se han borrado, pero no se pudo cerrar la cuenta. Escríbenos y la cerramos a mano.' }, 500);
  }

  return json({ ok: true, suscripciones_canceladas: canceladas, facturas_archivadas: resultado?.facturas_archivadas ?? 0 });
});
