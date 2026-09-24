// supabase/functions/invite-portal-client/index.ts
//
// Invita a un cliente al Portal de Cliente.
//
// POR QUE EXISTE: el portal estaba construido entero — proyectos, facturas,
// presupuestos, contratos, propuestas y el chat del proyecto — y no habia
// ninguna forma de que un cliente se enterase de que existia. Ni funcion, ni
// boton, ni correo, en ninguna parte del codigo. La unica via era decirselo a
// mano. "Portal de cliente" se anuncia en el plan Pro.
//
// EL CORREO NO LLEVA NINGUN ENLACE DE ACCESO. Lleva un boton a
// /portal/login con la direccion ya escrita, y es el cliente quien pide su
// enlace magico desde ahi. Dos motivos:
//   - Un enlace magico caduca en una hora. Una invitacion se lee cuando se
//     lee, y un enlace muerto en el correo parece que el portal esta roto.
//   - Un correo reenviado o leido por otro no da acceso a nada.
//
// RECUERDA: esta funcion NO se despliega con `git push`. Hay que desplegarla
// explicitamente cada vez que cambie este archivo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  puedeInvitarAlPortal,
  INVITACIONES_PORTAL_POR_DIA,
} from '../_shared/limites-portal.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'DevFreelancer <alertas@devfreelancer.app>';

const ORIGEN_POR_DEFECTO = 'https://devfreelancer.app';
const ORIGENES_PERMITIDOS = [
  'https://devfreelancer.app',
  'https://www.devfreelancer.app',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * El destino del enlace del correo no puede salir de una cabecera que fija
 * quien llama: seria una URL sin validar dentro de un correo que sale con el
 * dominio verificado de la aplicacion. Mismo criterio que invite-team-member.
 */
function origenSeguro(origen: string | null): string {
  if (!origen) return ORIGEN_POR_DEFECTO;
  try {
    const parsed = new URL(origen);
    if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') return parsed.origin;
    if (parsed.protocol === 'https:' && ORIGENES_PERMITIDOS.includes(parsed.origin)) {
      return parsed.origin;
    }
  } catch { /* origen ilegible */ }
  return ORIGEN_POR_DEFECTO;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Rechazo que el usuario debe ver. El frontend lee `success:false` + `message`. */
function rechazo(message: string) {
  return json({ success: false, message });
}

function cuerpoDelCorreo(
  nombreCliente: string,
  nombreFreelancer: string,
  enlace: string,
): string {
  const cliente = escaparHtml(nombreCliente);
  const freelancer = escaparHtml(nombreFreelancer);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">
        ${freelancer} te ha dado acceso a tu portal
      </h1>

      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Hola ${cliente}:
      </p>

      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        ${freelancer} trabaja contigo a través de DevFreelancer y te ha habilitado
        un portal privado. Desde ahí puedes consultar, cuando quieras y sin tener
        que pedirlo:
      </p>

      <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.8;">
        <li>El estado de tus proyectos</li>
        <li>Tus facturas y recibos</li>
        <li>Presupuestos y propuestas, que puedes aprobar desde el propio portal</li>
        <li>Tus contratos</li>
        <li>Un canal de mensajes directo con ${freelancer} para cada proyecto</li>
      </ul>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
        No hay que crear ninguna contraseña. Pulsa el botón, confirma tu correo y
        recibirás un enlace de acceso.
      </p>

      <p style="margin:0 0 24px;">
        <a href="${enlace}"
           style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">
          Entrar en mi portal
        </a>
      </p>

      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
        Si el botón no funciona, copia esta dirección en tu navegador:<br>
        <span style="word-break:break-all;">${escaparHtml(enlace)}</span>
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

      <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
        Si no esperabas este correo, puedes ignorarlo: no se ha creado ninguna
        cuenta a tu nombre y este mensaje no da acceso a nada por sí mismo.
      </p>
    </div>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) {
    return json({ error: 'No autorizado' }, 401);
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user: freelancer }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !freelancer) {
    return json({ error: 'Fallo al autenticar al usuario' }, 401);
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.error('Falta RESEND_API_KEY: no se puede enviar la invitación.');
    return json({ error: 'Error interno' }, 500);
  }

  try {
    const { clientId } = await req.json();
    if (!clientId || typeof clientId !== 'string') {
      return json({ error: 'Falta el identificador del cliente' }, 400);
    }

    const origin = origenSeguro(req.headers.get('Origin'));

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── CONTROL 1: la ficha tiene que ser suya ────────────────────────────
    //
    // El destinatario NO viaja en la petición: se lee de la ficha, y la ficha
    // tiene que pertenecer a quien llama. Asi, con una sesión válida solo se
    // puede escribir a las direcciones que uno mismo ha dado de alta como
    // clientes — nunca a una dirección arbitraria.
    const { data: cliente, error: errorCliente } = await supabaseAdmin
      .from('clients')
      .select('id, name, email, portal_invitado_en')
      .eq('id', clientId)
      .eq('user_id', freelancer.id)
      .maybeSingle();

    if (errorCliente) {
      console.error('No se pudo leer la ficha del cliente:', errorCliente.message);
      return json({ error: 'Error interno' }, 500);
    }

    if (!cliente) {
      return rechazo('Ese cliente no existe o no es tuyo.');
    }

    const destinatario = String(cliente.email ?? '').trim().toLowerCase();
    if (!destinatario) {
      return rechazo('Ese cliente no tiene email. Añádeselo a su ficha para poder invitarle.');
    }
    if (!EMAIL.test(destinatario)) {
      return rechazo('El email de ese cliente no es una dirección válida. Corrígelo en su ficha.');
    }

    // ── CONTROL 2: tope diario y espera entre reenvíos ────────────────────
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: invitadosHoy, error: errorConteo } = await supabaseAdmin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', freelancer.id)
      .gte('portal_invitado_en', hace24h);

    if (errorConteo) {
      console.error('No se pudieron contar las invitaciones:', errorConteo.message);
      return json({ error: 'Error interno' }, 500);
    }

    const veredicto = puedeInvitarAlPortal(
      invitadosHoy ?? 0,
      cliente.portal_invitado_en,
    );

    if (!veredicto.permitida) {
      return rechazo(veredicto.motivo);
    }

    // ── El correo ─────────────────────────────────────────────────────────
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('business_name, full_name')
      .eq('id', freelancer.id)
      .maybeSingle();

    const nombreFreelancer = perfil?.business_name || perfil?.full_name || 'Tu freelancer';

    // Sin token. El cliente pide su propio enlace desde el portal; aquí solo
    // se le lleva al formulario con su dirección ya puesta.
    const enlace = `${origin}/portal/login?email=${encodeURIComponent(destinatario)}`;

    const respuestaResend = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [destinatario],
        subject: `${nombreFreelancer} te ha dado acceso a tu portal de cliente`,
        html: cuerpoDelCorreo(cliente.name ?? 'Hola', nombreFreelancer, enlace),
      }),
    });

    if (!respuestaResend.ok) {
      // El error crudo de Resend no se le devuelve al navegador: puede llevar
      // detalles de la cuenta de correo.
      const detalle = await respuestaResend.text();
      console.error('Resend rechazó la invitación al portal:', respuestaResend.status, detalle);
      return rechazo('No se pudo enviar la invitación. Inténtalo de nuevo en unos minutos.');
    }

    // Solo se marca si el correo ha salido: un fallo de Resend no debe gastar
    // cupo ni activar la espera entre reenvíos.
    const { error: errorMarca } = await supabaseAdmin
      .from('clients')
      .update({ portal_invitado_en: new Date().toISOString() })
      .eq('id', cliente.id);

    if (errorMarca) {
      // No se deshace nada: el correo ya ha salido. Queda el aviso en los
      // registros — si esto fallara siempre, el tope dejaría de contar.
      console.error('Invitación enviada pero no registrada:', errorMarca.message);
    }

    return json({
      success: true,
      email: destinatario,
      restantesHoy: INVITACIONES_PORTAL_POR_DIA - (invitadosHoy ?? 0) - 1,
    });
  } catch (error) {
    console.error('Error enviando la invitación al portal:', error);
    return rechazo((error as Error).message || 'Error interno');
  }
});
