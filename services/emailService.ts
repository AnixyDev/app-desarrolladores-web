// services/emailService.ts
import { supabase } from '@/lib/supabaseClient';

// CAMBIO: NUEVO. Envío real de documentos (facturas, propuestas, presupuestos)
// con PDF adjunto de verdad, vía la Edge Function `send-document-email`
// (Resend en el backend). Sustituye al flujo de mailto: para estos casos,
// que nunca pudo adjuntar archivos.
export const sendDocumentEmail = async (params: {
  to: string;
  subject: string;
  html: string;
  pdfBase64: string;
  filename: string;
}): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('send-document-email', {
    body: {
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachmentBase64: params.pdfBase64,
      attachmentFilename: params.filename,
    },
  });

  if (error) {
    throw error;
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
