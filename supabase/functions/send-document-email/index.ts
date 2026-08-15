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
const FROM_ADDRESS = 'facturas@devfreelancer.app'; // CONFIRMAR: ¿es esta la dirección que quieres usar como remitente?

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
        from: FROM_ADDRESS,
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
