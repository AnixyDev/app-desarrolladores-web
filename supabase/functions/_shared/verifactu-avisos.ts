// Verifactu, fase 3 (07/10/2026): correos al usuario cuando el envío a la AEAT
// necesita algo de él. Puro: lo usan verifactu-enviar (Deno) y vitest
// (src/test/verifactu-avisos.test.ts).
//
// Solo se avisa de lo que el usuario puede arreglar:
//   - un registro RECHAZADO (p. ej. NIF del cliente fuera del censo): corrige
//     el dato y pulsa «Corregir y reenviar» en Registro fiscal;
//   - el certificado digital falta, ha caducado, no se puede abrir o la AEAT no
//     lo acepta: los registros esperan hasta que suba uno válido.
// Si la AEAT está caída no se avisa: se reintenta solo y la factura ya es válida.

export const URL_REGISTRO_FISCAL = 'https://devfreelancer.app/fiscal';
export const URL_AJUSTES = 'https://devfreelancer.app/settings';

/** Errores del envío entero que el usuario arregla con su certificado. */
const ERRORES_CERTIFICADO = new Set(['SIN_CERTIFICADO', 'CADUCADO', 'ILEGIBLE', '401', '403']);

export const esErrorDeCertificado = (codigo: string | null | undefined): boolean =>
  !!codigo && ERRORES_CERTIFICADO.has(codigo);

/** Un mismo aviso de certificado se repite como mucho una vez al día. */
export const HORAS_ENTRE_AVISOS = 24;

export function hayQueAvisar(
  motivo: string,
  ultimo: { motivo: string | null; en: string | null } | null,
  ahora: Date = new Date(),
): boolean {
  if (!ultimo?.motivo || !ultimo.en || ultimo.motivo !== motivo) return true;
  return ahora.getTime() - new Date(ultimo.en).getTime() >= HORAS_ENTRE_AVISOS * 3600_000;
}

const escaparHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const saludo = (nombre: string) => (nombre.trim() ? `Hola ${escaparHtml(nombre.trim())}` : 'Hola');

const plantilla = (titulo: string, parrafos: string[], boton: { texto: string; url: string }) => `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 12px;color:#dc2626;font-size:20px;">${escaparHtml(titulo)}</h2>
    ${parrafos.map((p) => `<p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.5;">${p}</p>`).join('')}
    <p style="margin:0 0 24px;">
      <a href="${boton.url}" style="background:#d9009f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">${escaparHtml(boton.texto)}</a>
    </p>
    <p style="margin:0;color:#999;font-size:13px;">Recibes este aviso porque tienes activado el envío de tus facturas a la Agencia Tributaria (VERI*FACTU) en DevFreelancer.</p>
  </div>`;

export interface RegistroRechazado { numero: string; codigo: string | null; error: string | null }

/** Correo de registros rechazados por la AEAT (uno por envío, con todos los rechazados). */
export function correoRechazo(nombre: string, rechazados: RegistroRechazado[]): { asunto: string; html: string } {
  const varios = rechazados.length > 1;
  const lista = '<ul style="padding-left:18px;margin:0;">' + rechazados.map((r) =>
    `<li style="margin:0 0 6px;"><strong>${escaparHtml(r.numero)}</strong>: ${escaparHtml(r.error ?? 'sin detalle')}${r.codigo ? ` <span style="color:#999;">(código ${escaparHtml(r.codigo)})</span>` : ''}</li>`).join('') + '</ul>';
  return {
    asunto: varios
      ? `Hacienda ha rechazado ${rechazados.length} registros de tus facturas`
      : `Hacienda ha rechazado el registro de la factura ${rechazados[0].numero}`,
    html: plantilla(
      varios ? 'Hacienda ha rechazado algunos registros' : 'Hacienda ha rechazado un registro',
      [
        `${saludo(nombre)}, la Agencia Tributaria no ha aceptado ${varios ? 'estos registros' : 'este registro'} de facturación:`,
        lista,
        'La factura sigue siendo válida, pero hay que volver a enviarla. Casi siempre es un dato del cliente (por ejemplo, un NIF mal escrito): corrígelo en su ficha y después pulsa <strong>«Corregir y reenviar»</strong> en Registro fiscal.',
      ],
      { texto: 'Ir a Registro fiscal', url: URL_REGISTRO_FISCAL },
    ),
  };
}

/** Correo de certificado que impide enviar. */
export function correoCertificado(nombre: string, mensaje: string, pendientes: number): { asunto: string; html: string } {
  return {
    asunto: 'Tus facturas no se pueden enviar a Hacienda: revisa tu certificado digital',
    html: plantilla(
      'No podemos enviar tus facturas a Hacienda',
      [
        `${saludo(nombre)}. ${escaparHtml(mensaje)}`,
        `Hay ${pendientes} ${pendientes === 1 ? 'registro esperando' : 'registros esperando'} para enviarse. En cuanto subas un certificado válido se envían solos; no tienes que hacer nada más.`,
      ],
      { texto: 'Subir el certificado', url: URL_AJUSTES },
    ),
  };
}
