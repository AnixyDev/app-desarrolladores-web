// Correos de documentos (facturas y contratos) — los redacta el SERVIDOR.
//
// Antes send-document-email recibía del navegador el destinatario, el asunto
// y el HTML. La única comprobación era que el destinatario fuese un cliente
// del usuario, y cualquiera puede crear un cliente con el email que quiera:
// seguía siendo un relé de correo desde facturas@devfreelancer.app, con el
// remitente y el texto que se quisiera (phishing con el dominio de la casa).
//
// Ahora el navegador solo dice QUÉ documento envía; el destinatario, el asunto
// y el cuerpo salen de la base de datos y de estas plantillas.
//
// Este archivo no importa nada de Deno ni de la red: lo cargan la Edge
// Function y vitest.

export const escaparHtml = (texto: unknown): string =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Nombre visible del remitente. Siempre lleva "vía DevFreelancer": el nombre
 * del negocio lo escribe el usuario, y sin la coletilla cualquiera podía
 * firmar como "Agencia Tributaria" desde el dominio verificado.
 */
export const nombreDelRemitente = (nombreNegocio: unknown): string => {
  const limpio = String(nombreNegocio ?? '')
    .replace(/[<>"\\\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${limpio || 'Tu freelancer'} vía DevFreelancer`;
};

/** ¿Es de verdad un PDF? (base64 de "%PDF-" empieza por "JVBERi0"). */
export const esPdfEnBase64 = (b64: unknown): boolean =>
  typeof b64 === 'string' && b64.startsWith('JVBERi0');

/** Nombre de archivo seguro para el adjunto. */
export const nombreDeArchivo = (prefijo: string, referencia: unknown): string => {
  const ref = String(referencia ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${prefijo}${ref ? '-' + ref : ''}.pdf`;
};

const euros = (cents: number): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);

export interface Correo { asunto: string; html: string }

export function correoDeFactura(d: {
  cliente: string; numero: string; totalCents: number; enlacePago: string;
  /** Número de la factura que corrige, si es rectificativa. */
  rectificaA?: string | null;
}): Correo {
  const numero = String(d.numero ?? '').slice(0, 60);
  const rectificativa = d.rectificaA !== undefined && d.rectificaA !== null;
  // Sin nada que cobrar (abono o rectificativa a la baja), sin enlace de pago.
  const cobrable = Number(d.totalCents) > 0;
  const tipo = rectificativa ? 'factura rectificativa' : 'factura';
  return {
    asunto: `${rectificativa ? 'Factura rectificativa' : 'Factura'} ${numero}`,
    html:
      `<p>Hola ${escaparHtml(d.cliente)},</p>` +
      `<p>Te envío la ${tipo} ${escaparHtml(numero)}` +
      (rectificativa ? `, que corrige la factura ${escaparHtml(String(d.rectificaA).slice(0, 60))},` : '') +
      ` por un importe de ${escaparHtml(euros(d.totalCents))}. ` +
      `La encontrarás adjunta en este email.</p>` +
      (cobrable
        ? `<p>Puedes pagarla online con tarjeta desde este enlace: ` +
          `<a href="${escaparHtml(d.enlacePago)}">${escaparHtml(d.enlacePago)}</a></p>`
        : '') +
      `<p>Un saludo.</p>`,
  };
}

export function correoDeContrato(d: {
  cliente: string; proyecto: string; firma: string; enlacePortal: string;
  /** Ya firmado: se manda la copia, no se pide firma. */
  firmado?: boolean;
}): Correo {
  const proyecto = String(d.proyecto ?? '').slice(0, 120);
  if (d.firmado) {
    return {
      asunto: `Contrato firmado del proyecto "${proyecto}"`,
      html:
        `<p>Hola ${escaparHtml(d.cliente)},</p>` +
        `<p>Te envío una copia del contrato firmado de nuestro proyecto "${escaparHtml(proyecto)}". La encontrarás adjunta en este email.</p>` +
        `<p>También puedes consultarlo aquí:<br/>` +
        `<a href="${escaparHtml(d.enlacePortal)}">${escaparHtml(d.enlacePortal)}</a></p>` +
        `<p>Saludos,<br/>${escaparHtml(d.firma)}</p>`,
    };
  }
  return {
    asunto: `Contrato para el proyecto "${proyecto}"`,
    html:
      `<p>Hola ${escaparHtml(d.cliente)},</p>` +
      `<p>Te envío el contrato para nuestro proyecto "${escaparHtml(proyecto)}".</p>` +
      `<p>Puedes revisarlo y firmarlo digitalmente aquí:<br/>` +
      `<a href="${escaparHtml(d.enlacePortal)}">${escaparHtml(d.enlacePortal)}</a></p>` +
      `<p>Encontrarás también el PDF adjunto para tu archivo.</p>` +
      `<p>Saludos,<br/>${escaparHtml(d.firma)}</p>`,
  };
}

export function correoDePresupuesto(d: {
  cliente: string; descripcion: string; importeCents: number; enlacePortal: string; firma: string;
}): Correo {
  const descripcion = String(d.descripcion ?? '').slice(0, 120);
  return {
    asunto: `Presupuesto: ${descripcion}`,
    html:
      `<p>Hola ${escaparHtml(d.cliente)},</p>` +
      `<p>Te envío el presupuesto "${escaparHtml(descripcion)}" por ${escaparHtml(euros(d.importeCents))} (impuestos no incluidos). Lo encontrarás adjunto en este email.</p>` +
      `<p>Puedes aceptarlo o rechazarlo aquí:<br/>` +
      `<a href="${escaparHtml(d.enlacePortal)}">${escaparHtml(d.enlacePortal)}</a></p>` +
      `<p>Saludos,<br/>${escaparHtml(d.firma)}</p>`,
  };
}

export function correoDePropuesta(d: {
  cliente: string; titulo: string; importeCents: number; enlacePortal: string; firma: string;
}): Correo {
  const titulo = String(d.titulo ?? '').slice(0, 120);
  return {
    asunto: `Propuesta: ${titulo}`,
    html:
      `<p>Hola ${escaparHtml(d.cliente)},</p>` +
      `<p>Te envío la propuesta "${escaparHtml(titulo)}" por ${escaparHtml(euros(d.importeCents))} (impuestos no incluidos). La encontrarás adjunta en este email.</p>` +
      `<p>Puedes revisarla y responder aquí:<br/>` +
      `<a href="${escaparHtml(d.enlacePortal)}">${escaparHtml(d.enlacePortal)}</a></p>` +
      `<p>Saludos,<br/>${escaparHtml(d.firma)}</p>`,
  };
}

export function correoDeRecibo(d: {
  cliente: string; numero: string; concepto: string; importeCents: number; firma: string;
}): Correo {
  const numero = String(d.numero ?? '').slice(0, 60);
  return {
    asunto: `Recibo ${numero}`,
    html:
      `<p>Hola ${escaparHtml(d.cliente)},</p>` +
      `<p>Te envío el recibo ${escaparHtml(numero)} de ${escaparHtml(euros(d.importeCents))} por "${escaparHtml(String(d.concepto ?? '').slice(0, 200))}". Lo encontrarás adjunto en este email.</p>` +
      `<p>Gracias.</p>` +
      `<p>Saludos,<br/>${escaparHtml(d.firma)}</p>`,
  };
}

/** Documentos que se pueden enviar por email desde la app. */
export const TIPOS_DE_DOCUMENTO = ['factura', 'contrato', 'presupuesto', 'propuesta', 'recibo'] as const;
export type TipoDeDocumento = typeof TIPOS_DE_DOCUMENTO[number];

/** Envíos por usuario y día. Holgado para el uso normal; corta el abuso. */
export const ENVIOS_DE_DOCUMENTOS_POR_DIA = 50;
