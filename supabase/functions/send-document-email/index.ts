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
  correoDePresupuesto,
  correoDePropuesta,
  correoDeRecibo,
  TIPOS_DE_DOCUMENTO,
  ENVIOS_DE_DOCUMENTOS_POR_DIA,
  type Correo,
} from '../_shared/correo-documentos.ts';
import {
  cargarRemitentePropio,
  apuntarErrorPropio,
  enviarPorResend,
  formatearRemitente,
  nombreVisiblePropio,
  motivoDelRechazo,
  planPermiteRemitentePropio,
  TOPES_CON_REMITENTE_PROPIO,
} from '../_shared/remitente-propio.ts';
import { descifradorConClave } from '../_shared/cripto.ts';

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
      .select('business_name, full_name, email, invoice_reply_to_email, plan')
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

    const firma = profile.full_name || profile.business_name || '';
    // El email del cliente de ese documento, de las fichas del propio usuario.
    const clienteDe = async (clientId: string | null) => {
      if (!clientId) return null;
      const { data } = await supabase
        .from('clients').select('name, email').eq('id', clientId).eq('user_id', user.id).maybeSingle();
      return data as { name: string | null; email: string | null } | null;
    };
    const enlaceDelPortal = (ruta: string, email: string) =>
      `${SITIO}/portal/${ruta}?email=${encodeURIComponent(email)}`;

    if (tipo === 'factura') {
      const { data: factura } = await supabase
        .from('invoices')
        .select('id, client_id, invoice_number, total_cents, rectifies_invoice_id')
        .eq('id', documentoId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!factura) return json({ error: 'Esa factura no existe o no es tuya.' }, 404);

      let rectificaA: string | null | undefined = undefined;
      if (factura.rectifies_invoice_id) {
        const { data: original } = await supabase
          .from('invoices').select('invoice_number').eq('id', factura.rectifies_invoice_id).eq('user_id', user.id).maybeSingle();
        rectificaA = original?.invoice_number ?? '';
      }

      const cliente = await clienteDe(factura.client_id);
      destinatario = String(cliente?.email ?? '').trim().toLowerCase();
      correo = correoDeFactura({
        cliente: cliente?.name ?? '',
        numero: factura.invoice_number,
        totalCents: factura.total_cents,
        enlacePago: `${SITIO}/pay/${factura.id}`,
        rectificaA,
      });
      archivo = nombreDeArchivo(rectificaA !== undefined ? 'Factura-rectificativa' : 'Factura', factura.invoice_number);
    } else if (tipo === 'contrato') {
      const { data: contrato } = await supabase
        .from('contracts')
        .select('id, client_id, project_id, status')
        .eq('id', documentoId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!contrato) return json({ error: 'Ese contrato no existe o no es tuyo.' }, 404);

      const [cliente, { data: proyecto }] = await Promise.all([
        clienteDe(contrato.client_id),
        supabase.from('projects').select('name').eq('id', contrato.project_id).eq('user_id', user.id).maybeSingle(),
      ]);
      destinatario = String(cliente?.email ?? '').trim().toLowerCase();
      correo = correoDeContrato({
        cliente: cliente?.name ?? '',
        proyecto: proyecto?.name ?? '',
        firma,
        // Con el email puesto: sin sesión, el portal pide acceso con esa
        // dirección ya escrita y, al entrar, vuelve a este contrato.
        enlacePortal: enlaceDelPortal(`contracts/${contrato.id}`, destinatario),
        firmado: contrato.status === 'signed',
      });
      archivo = nombreDeArchivo('Contrato', proyecto?.name);
    } else if (tipo === 'presupuesto') {
      const { data: presupuesto } = await supabase
        .from('budgets')
        .select('id, client_id, description, amount_cents')
        .eq('id', documentoId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!presupuesto) return json({ error: 'Ese presupuesto no existe o no es tuyo.' }, 404);

      const cliente = await clienteDe(presupuesto.client_id);
      destinatario = String(cliente?.email ?? '').trim().toLowerCase();
      correo = correoDePresupuesto({
        cliente: cliente?.name ?? '',
        descripcion: presupuesto.description,
        importeCents: presupuesto.amount_cents,
        enlacePortal: enlaceDelPortal(`budgets/${presupuesto.id}`, destinatario),
        firma,
      });
      archivo = nombreDeArchivo('Presupuesto', presupuesto.description);
    } else if (tipo === 'propuesta') {
      const { data: propuesta } = await supabase
        .from('proposals')
        .select('id, client_id, title, amount_cents')
        .eq('id', documentoId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!propuesta) return json({ error: 'Esa propuesta no existe o no es tuya.' }, 404);

      const cliente = await clienteDe(propuesta.client_id);
      destinatario = String(cliente?.email ?? '').trim().toLowerCase();
      correo = correoDePropuesta({
        cliente: cliente?.name ?? '',
        titulo: propuesta.title,
        importeCents: propuesta.amount_cents,
        enlacePortal: enlaceDelPortal(`proposals/${propuesta.id}`, destinatario),
        firma,
      });
      archivo = nombreDeArchivo('Propuesta', propuesta.title);
    } else {
      const { data: recibo } = await supabase
        .from('receipts')
        .select('id, client_id, receipt_number, concept, amount_cents')
        .eq('id', documentoId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!recibo) return json({ error: 'Ese recibo no existe o no es tuyo.' }, 404);
      if (!recibo.client_id) return json({ error: 'Este recibo no tiene cliente: edítalo y elige uno para poder enviarlo.' }, 400);

      const cliente = await clienteDe(recibo.client_id);
      destinatario = String(cliente?.email ?? '').trim().toLowerCase();
      correo = correoDeRecibo({
        cliente: cliente?.name ?? '',
        numero: recibo.receipt_number,
        concepto: recibo.concept,
        importeCents: recibo.amount_cents,
        firma,
      });
      archivo = nombreDeArchivo('Recibo', recibo.receipt_number);
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
    // 4. ¿Envía con su propio dominio (Pro/Teams) o por la plataforma?
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const propio = await cargarRemitentePropio(supabaseAdmin, user.id, profile.plan, descifradorConClave(Deno.env.get('APP_ENCRYPTION_KEY')));
    const tope = propio ? TOPES_CON_REMITENTE_PROPIO.documentosPorDia : ENVIOS_DE_DOCUMENTOS_POR_DIA;

    // 5. Cupo diario de envíos, apuntado en el servidor con candado.
    const { data: hayCupo, error: errorCupo } = await supabaseAdmin.rpc('reservar_envio_documento', {
      p_user: user.id,
      p_tipo: tipo,
      p_documento: documentoId,
      p_email: destinatario,
      p_max_dia: tope,
    });
    if (errorCupo) {
      console.error('[send-document-email] no se pudo reservar el envío:', errorCupo.message);
      return json({ error: 'Error interno' }, 500);
    }
    if (!hayCupo) {
      const sugerencia = propio
        ? ''
        : planPermiteRemitentePropio(profile.plan)
          ? ' Si conectas tu propio dominio en Ajustes → Perfil, podrás enviar sin este límite.'
          : ' Con los planes Pro y Teams puedes enviar desde tu propio dominio sin este límite.';
      return json({ error: `Has llegado al máximo de ${tope} envíos en 24 horas. Inténtalo mañana.${sugerencia}` }, 429);
    }

    // 6. Enviar vía Resend: con SU clave y SU dirección, o con la de la plataforma.
    const resendApiKey = propio?.apiKey ?? Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY no configurada en los secrets de Supabase');
      return json({ error: 'Configuración de email incompleta' }, 500);
    }

    const envio = await enviarPorResend(resendApiKey, {
      from: propio
        ? formatearRemitente(nombreVisiblePropio(profile.business_name || profile.full_name), propio.direccion)
        : fromAddress,
      reply_to: replyToAddress,
      to: [destinatario],
      subject: correo.asunto,
      html: correo.html,
      attachments: [{ filename: archivo, content: attachmentBase64 }],
    });

    if (!envio.ok) {
      if (propio) {
        // Es SU cuenta: el motivo es lo que necesita para arreglarla. No se
        // reintenta por la plataforma (ver _shared/remitente-propio.ts).
        const motivo = motivoDelRechazo(envio.status, envio.cuerpo);
        await apuntarErrorPropio(supabaseAdmin, user.id, motivo);
        return json({ error: `${motivo} Revísalo en Ajustes → Perfil → Enviar desde tu dominio.` }, 502);
      }
      // El cuerpo de error de la cuenta de la plataforma va al log, no al navegador.
      console.error('Error de Resend:', envio.status, envio.cuerpo);
      return json({ error: 'No se pudo enviar el email. Inténtalo de nuevo.' }, 502);
    }
    if (propio) await apuntarErrorPropio(supabaseAdmin, user.id, null);

    return json({ ok: true, email: destinatario, desde: propio ? propio.direccion : null });
  } catch (err) {
    console.error('Error inesperado en send-document-email:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
