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

interface SendDocumentEmailPayload {
  to: string;
  subject: string;
  html: string;
  attachmentBase64: string; // PDF sin el prefijo data:application/pdf;base64,
  attachmentFilename: string;
}

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

    const displayName = profile.business_name || profile.full_name || 'Devfreelancer';
    const fromAddress = `${displayName} <${FROM_DOMAIN_ADDRESS}>`;
    const replyToAddress = profile.invoice_reply_to_email || profile.email;

    // 2. Validar payload
    const payload: SendDocumentEmailPayload = await req.json();
    const { to, subject, html, attachmentBase64, attachmentFilename } = payload;

    if (!to || !subject || !attachmentBase64 || !attachmentFilename) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Enviar vía Resend (fetch directo a su API REST — en Deno no hace
    //    falta el SDK de npm, y evita añadir otra dependencia al proyecto).
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY no configurada en los secrets de Supabase');
      return new Response(JSON.stringify({ error: 'Configuración de email incompleta' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendResponse = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        reply_to: replyToAddress,
        to: [to],
        subject,
        html,
        attachments: [
          {
            filename: attachmentFilename,
            content: attachmentBase64,
          },
        ],
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Error de Resend:', resendData);
      return new Response(JSON.stringify({ error: resendData?.message || 'Error al enviar el email' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: resendData.id }), {
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
