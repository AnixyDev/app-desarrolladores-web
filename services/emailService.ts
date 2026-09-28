// services/emailService.ts
import { supabase } from '@/lib/supabaseClient';

// CAMBIO: NUEVO. Envío real de documentos (facturas, propuestas, presupuestos)
// con PDF adjunto de verdad, vía la Edge Function `send-document-email`
// (Resend en el backend). Sustituye al flujo de mailto: para estos casos,
// que nunca pudo adjuntar archivos.
// CAMBIO (27/09): el navegador ya no manda destinatario, asunto ni texto: solo
// qué documento envía y su PDF. El servidor saca el email del cliente de ese
// documento y redacta el correo (ver supabase/functions/_shared/correo-documentos.ts).
export const sendDocumentEmail = async (params: {
  tipo: 'factura' | 'contrato' | 'presupuesto' | 'propuesta' | 'recibo';
  documentoId: string;
  pdfBase64: string;
}): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('send-document-email', {
    body: {
      tipo: params.tipo,
      documento_id: params.documentoId,
      attachmentBase64: params.pdfBase64,
    },
  });

  if (error) {
    // El motivo real (sin email, cupo diario…) viene en el cuerpo de la respuesta.
    let detalle = '';
    try {
      const cuerpo = await (error as any).context?.json?.();
      detalle = cuerpo?.error ?? '';
    } catch { /* cuerpo no legible */ }
    throw new Error(detalle || 'No se pudo enviar el email. Inténtalo de nuevo.');
  }
  if (data?.error) {
    throw new Error(data.error);
  }
};

/**
 * Opens the default mail client to send an email.
 * This is a client-side utility and does not send emails from a server.
 *
 * CAMBIO: se mantiene SOLO para los enlaces de "contacto directo" (escribir
 * a un cliente desde ClientsPage/ClientDetailPage/PublicProfilePage), donde
 * abrir el cliente de correo del usuario sigue siendo el comportamiento
 * correcto. Para facturas/propuestas/presupuestos usar sendDocumentEmail.
 *
 * @param to The recipient's email address.
 * @param subject The subject of the email.
 * @param body The body of the email.
 */
export const sendEmail = (to: string, subject: string, body: string): void => {
    const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
};
