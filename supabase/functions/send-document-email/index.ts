// supabase/functions/send-document-email/index.ts
//
// Reemplaza el flujo de mailto: para el envío de facturas, propuestas y
// presupuestos. Recibe el PDF ya generado en base64 desde el cliente
// (pdfService.ts -> generateInvoicePdfBase64) y lo manda como adjunto real
// vía la API de Resend, usando el dominio verificado @devfreelancer.app.
//
// RECUERDA: esta función NO se despliega con `git push`. Hay que desplegarla
// explícitamente cada vez que cambie este archivo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  nombreDelRemitente,
  esPdfEnBase64,
  nombreDeArchivo,
  correoDeFactura,
  correoDeContrato,
  TIPOS_DE_DOCUMENTO,
  ENVIOS_DE_DOCUMENTOS_POR_DIA,
  type Correo,
} from '../_shared/correo-documentos.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
// CAMBIO: ya no hay remitente/reply-to fijos — se resuelven por usuario más
// abajo, leyendo su fila de `profiles`. `from` sigue obligado a usar el
// dominio verificado en Resend (devfreelancer.app), pero el nombre visible
// y el reply_to sí son por usuario.
const FROM_DOMAIN_ADDRESS = 'facturas@devfreelancer.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CAMBIO (27/09): el navegador ya no manda destinatario, asunto ni HTML. Solo
// QUÉ documento envía y su PDF. Todo lo demás sale de la base de datos (ver
// _shared/correo-documentos.ts para el porqué).
interface SendDocumentEmailPayload {
  tipo: string;
  documento_id: string;
  attachmentBase64: string; // PDF sin el prefijo data:application/pdf;base64,
}

const SITIO = (Deno.env.get('SITE_URL') ?? 'https://devfreelancer.app').replace(/\/$/, '');

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verificar que quien llama está autenticado (mismo patrón que el
    //    resto de Edge Functions del proyecto: se valida el JWT del usuario).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CAMBIO: resolver remitente visible y reply-to por usuario. `invoice_reply_to_email`
    // es opcional (configurable en Ajustes) — si el usuario no lo ha rellenado,
    // se cae al email de su cuenta, que siempre existe.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('business_name, full_name, email, invoice_reply_to_email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('No se pudo cargar el perfil del usuario:', profileError);
      return new Response(JSON.stringify({ error: 'No se pudo cargar tu perfil' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromAddress = `${nombreDelRemitente(profile.business_name || profile.full_name)} <${FROM_DOMAIN_ADDRESS}>`;
    const replyToAddress = profile.invoice_reply_to_email || profile.email || user.email;

    // 2. Qué documento: tiene que ser del usuario, y el destinatario es el
    //    email del cliente de ese documento. Nada de esto lo decide el navegador.
    const payload = (await req.json().catch(() => ({}))) as Partial<SendDocumentEmailPayload>;
    const tipo = String(payload.tipo ?? '');
    const documentoId = String(payload.documento_id ?? '');
    const attachmentBase64 = payload.attachmentBase64;

    if (!(TIPOS_DE_DOCUMENTO as readonly string[]).includes(tipo) || !/^[0-9a-f-]{36}$/i.test(documentoId)) {
      return json({ error: 'Documento no válido' }, 400);
    }

    let destinatario = '';
    let correo: Correo;
    let archivo: string;

    if (tipo === 'factura') {
      const { data: factura } = await supabase
        .from('invoices')
        .select('id, client_id, invoice_number, total_cents')
        .eq('id', documentoId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!factura) return json({ error: 'Esa factura no existe o no es tuya.' }, 404);

      const { data: cliente } = await supabase
        .from('clients').select('name, email').eq('id', factura.client_id).eq('user_id', user.id).maybeSingle();
      destinatario = String(cliente?.email ?? '').trim().toLowerCase();
      correo = correoDeFactura({
        cliente: cliente?.name ?? '',
        numero: factura.invoice_number,
        totalCents: factura.total_cents,
        enlacePago: `${SITIO}/pay/${factura.id}`,
      });
      archivo = nombreDeArchivo('Factura', factura.invoice_number);
    } else {
      const { data: contrato } = await supabase
        .from('contracts')
        .select('id, client_id, project_id')
        .eq('id', documentoId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!contrato) return json({ error: 'Ese contrato no existe o no es tuyo.' }, 404);

      const [{ data: cliente }, { data: proyecto }] = await Promise.all([
        supabase.from('clients').select('name, email').eq('id', contrato.client_id).eq('user_id', user.id).maybeSingle(),
        supabase.from('projects').select('name').eq('id', contrato.project_id).eq('user_id', user.id).maybeSingle(),
      ]);
      destinatario = String(cliente?.email ?? '').trim().toLowerCase();
      correo = correoDeContrato({
        cliente: cliente?.name ?? '',
        proyecto: proyecto?.name ?? '',
        firma: profile.full_name || profile.business_name || '',
        // Con el email puesto: sin sesión, el portal pide acceso con esa dirección
        // ya escrita y, al entrar, vuelve a este contrato.
        enlacePortal: `${SITIO}/portal/contracts/${contrato.id}?email=${encodeURIComponent(destinatario)}`,
      });
      archivo = nombreDeArchivo('Contrato', proyecto?.name);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destinatario)) {
      return json({ error: 'Este cliente no tiene un email válido. Añádeselo en su ficha.' }, 400);
    }

    // 3. El adjunto tiene que ser un PDF.
    if (!esPdfEnBase64(attachmentBase64)) {
      return json({ error: 'El adjunto tiene que ser el PDF del documento.' }, 400);
    }

    // Un PDF de factura ronda los 50-300 kB. El tope existe para que nadie
    // pueda usar esto para mover ficheros grandes a través de tu cuenta.
    const MAX_ADJUNTO_BASE64 = 8 * 1024 * 1024; // ~6 MB reales
    if (String(attachmentBase64).length > MAX_ADJUNTO_BASE64) {
      return new Response(JSON.stringify({ error: 'El adjunto es demasiado grande' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // 4. Cupo diario de envíos, apuntado en el servidor con candado.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: hayCupo, error: errorCupo } = await supabaseAdmin.rpc('reservar_envio_documento', {
      p_user: user.id,
      p_tipo: tipo,
      p_documento: documentoId,
      p_email: destinatario,
      p_max_dia: ENVIOS_DE_DOCUMENTOS_POR_DIA,
    });
    if (errorCupo) {
      console.error('[send-document-email] no se pudo reservar el envío:', errorCupo.message);
      return json({ error: 'Error interno' }, 500);
    }
    if (!hayCupo) {
      return json({ error: `Has llegado al máximo de ${ENVIOS_DE_DOCUMENTOS_POR_DIA} envíos en 24 horas. Inténtalo mañana.` }, 429);
    }

    // 5. Enviar vía Resend (fetch directo a su API REST — en Deno no hace
    //    falta el SDK de npm, y evita añadir otra dependencia al proyecto).
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY no configurada en los secrets de Supabase');
      return new Response(JSON.stringify({ error: 'Configuración de email incompleta' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendBody: Record<string, unknown> = {
      from: fromAddress,
      reply_to: replyToAddress,
      to: [destinatario],
      subject: correo.asunto,
      html: correo.html,
      attachments: [{ filename: archivo, content: attachmentBase64 }],
    };

    const resendResponse = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      // El cuerpo de error de Resend va al log, no al navegador.
      console.error('Error de Resend:', resendData);
      return new Response(JSON.stringify({ error: 'No se pudo enviar el email. Inténtalo de nuevo.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, email: destinatario }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error inesperado en send-document-email:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
