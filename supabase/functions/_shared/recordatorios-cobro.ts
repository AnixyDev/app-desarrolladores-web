// Recordatorios de cobro (30/09/2026). Pura: la usan la Edge Function
// recordatorios-cobro, la pantalla de Ajustes (vista previa) y vitest.
//
// HALLAZGO: Ajustes → Notificaciones ya tenía «Enviar recordatorios de pago
// automáticos a mis clientes» con dos plantillas, pero NADA los enviaba. Quien
// lo activaba creía que sus clientes recibían avisos y no salía ningún correo.
//
// Cuándo sale cada uno (una sola vez por factura y nivel):
//   -3  → 3 días ANTES del vencimiento (plantilla «próxima a vencer»), solo si
//         la factura se emitió con margen (≥ 7 días antes de vencer).
//    3  → 3 días después de vencer        (plantilla «vencida»)
//   15  → 15 días después (segundo recordatorio)
//   30  → 30 días después (último recordatorio)
// Si una factura se activa tarde, solo sale el nivel más alto alcanzado, no
// todos de golpe. Más de 120 días vencida: ya no se recuerda automáticamente.

// Sin imports: lo cargan Deno, Vite y vitest, y Vite no acepta rutas «.ts».
const escaparHtml = (texto: unknown): string =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const NIVELES = [-3, 3, 15, 30] as const;
export type NivelRecordatorio = (typeof NIVELES)[number];
export const MAX_DIAS_VENCIDA = 120;
export const MAX_LONGITUD_PLANTILLA = 600;

const DIA_MS = 86_400_000;
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / DIA_MS);

/**
 * Qué recordatorio toca hoy para una factura, o null.
 * `yaEnviados`: niveles ya enviados de esa factura.
 */
export function nivelQueToca(p: { emision: string; vencimiento: string; hoy: string; yaEnviados: number[] }): NivelRecordatorio | null {
  if (!p.vencimiento) return null;
  const dias = diasEntre(p.vencimiento, p.hoy); // negativo = aún no vence
  if (dias > MAX_DIAS_VENCIDA) return null;
  const maxEnviado = p.yaEnviados.length ? Math.max(...p.yaEnviados) : -Infinity;

  let toca: NivelRecordatorio | null = null;
  if (dias >= -3 && dias < 0) {
    const margen = diasEntre(p.emision || p.vencimiento, p.vencimiento);
    if (margen >= 7) toca = -3;
  } else {
    for (const n of [3, 15, 30] as const) if (dias >= n) toca = n;
  }
  if (toca === null || toca <= maxEnviado) return null;
  return toca;
}

const euros = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);

const fechaLarga = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const PLANTILLA_PROXIMA_POR_DEFECTO =
  'Hola [ClientName], te recuerdo que la factura [InvoiceNumber] por [Amount] vence el [DueDate]. Si ya la has pagado, ignora este mensaje.';
export const PLANTILLA_VENCIDA_POR_DEFECTO =
  'Hola [ClientName], la factura [InvoiceNumber] por [Amount] venció el [DueDate] y todavía figura como pendiente. ¿Me confirmas cuándo podrás pagarla? Si ya lo has hecho, ignora este mensaje.';

/**
 * Rellena la plantilla del usuario. Acepta los marcadores en inglés que traía
 * la base de datos ([InvoiceNumber]…) y los que sugería la pantalla ({numero}…).
 * El texto del usuario se escapa y se le QUITAN los enlaces: el correo sale
 * desde el dominio de la casa y el único enlace permitido es el de pago.
 */
export function rellenarPlantilla(plantilla: string, d: { cliente: string; numero: string; pendienteCents: number; vencimiento: string }): string {
  const limpia = String(plantilla ?? '')
    .slice(0, MAX_LONGITUD_PLANTILLA)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\s{3,}/g, '  ')
    .trim();
  const valores: Record<string, string> = {
    InvoiceNumber: d.numero, numero: d.numero,
    Amount: euros(d.pendienteCents), importe: euros(d.pendienteCents),
    DueDate: fechaLarga(d.vencimiento), fecha: fechaLarga(d.vencimiento),
    ClientName: d.cliente, cliente: d.cliente,
  };
  return escaparHtml(limpia)
    .replace(/\[(InvoiceNumber|Amount|DueDate|ClientName)\]|\{(numero|importe|fecha|cliente)\}/g, (_m, a, b) => escaparHtml(valores[a ?? b]))
    .replace(/\n/g, '<br>');
}

const ASUNTOS: Record<NivelRecordatorio, (n: string) => string> = {
  [-3]: n => `Recordatorio: la factura ${n} vence en 3 días`,
  3: n => `Factura ${n} pendiente de pago`,
  15: n => `Segundo recordatorio: factura ${n} pendiente`,
  30: n => `Último recordatorio: factura ${n} pendiente desde hace 30 días`,
};

export function correoDeRecordatorio(d: {
  nivel: NivelRecordatorio;
  cliente: string;
  numero: string;
  pendienteCents: number;
  vencimiento: string;
  /** Solo si el freelancer tiene los cobros con tarjeta activados (Stripe). */
  enlacePago?: string | null;
  plantillaProxima?: string | null;
  plantillaVencida?: string | null;
  firma: string;
}): { asunto: string; html: string } {
  const numero = String(d.numero ?? '').slice(0, 60);
  const plantilla = d.nivel === -3
    ? (d.plantillaProxima?.trim() || PLANTILLA_PROXIMA_POR_DEFECTO)
    : (d.plantillaVencida?.trim() || PLANTILLA_VENCIDA_POR_DEFECTO);
  const cuerpo = rellenarPlantilla(plantilla, { cliente: d.cliente || 'cliente', numero, pendienteCents: d.pendienteCents, vencimiento: d.vencimiento });
  const html =
    `<p>${cuerpo}</p>` +
    `<p>Importe pendiente: <strong>${escaparHtml(euros(d.pendienteCents))}</strong><br>` +
    `Vencimiento: ${escaparHtml(fechaLarga(d.vencimiento))}</p>` +
    (d.enlacePago
      ? `<p>Puedes pagarla online desde este enlace: <a href="${escaparHtml(d.enlacePago)}">${escaparHtml(d.enlacePago)}</a></p>`
      : '') +
    `<p>Un saludo,<br>${escaparHtml(d.firma)}</p>` +
    `<p style="color:#888;font-size:12px">Si tienes cualquier duda, responde a este correo.</p>`;
  return { asunto: ASUNTOS[d.nivel](numero), html };
}
