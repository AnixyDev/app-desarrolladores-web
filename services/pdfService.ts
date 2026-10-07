// services/pdfService.ts
import type { Invoice, Client, Profile, Receipt, Contract } from '@/types';
import { formatCurrency, calculateInvoiceTotals } from '@/lib/utils';
import { mencionSinIva } from '@/lib/ivaClientes';
import jsPDF from 'jspdf';
import * as autoTableNamespace from 'jspdf-autotable';
import QRCode from 'qrcode';

// FIX: la interoperabilidad CJS/ESM de jspdf-autotable con Vite/Rolldown ha ido
// cambiando de forma entre intentos (a veces el export real está en `.default`,
// a veces envuelto un nivel más en `.default.default`). En vez de asumir un
// nivel concreto de envoltorio, se prueban todos los candidatos posibles en
// tiempo de ejecución y se usa el primero que sea realmente una función.
// Esto es robusto frente a cambios de bundler/versión sin tener que adivinar.
function resolveAutoTable(): (doc: jsPDF, options: any) => void {
    const ns = autoTableNamespace as any;
    const candidates = [ns, ns?.default, ns?.default?.default, ns?.autoTable];
    const fn = candidates.find((c) => typeof c === 'function');
    if (!fn) {
        throw new Error('No se pudo cargar la librería jspdf-autotable (export no encontrado).');
    }
    return fn;
}

// --- Cumplimiento Veri*Factu (RD 1007/2023 / Orden HAC/1177/2024) ---
// Datos mínimos del registro fiscal necesarios para pintar el QR y el
// texto obligatorio en el PDF. No incluye el hash completo en el QR (la
// norma no lo pide ahí, solo en el registro interno) — el QR es una URL
// de cotejo contra la sede de la AEAT.
export interface FiscalPdfData {
  modalidad: 'verifactu' | 'no_verifactu';
  hash: string;
  /**
   * NIF e importe tal como constan en el registro fiscal (07/10/2026). El QR
   * se coteja con el registro enviado a la AEAT: el importe es base + IVA, sin
   * restar la retención de IRPF (el total a pagar de la factura sí la resta),
   * y el NIF va normalizado (sin espacios ni guiones).
   */
  nifEmisor?: string;
  importeTotalCents?: number;
}

// URL de cotejo AEAT (producción). Formato y parámetros (nif, numserie,
// fecha DD-MM-AAAA, importe con punto decimal) según la Orden HAC/1177/2024.
//
// Cada modalidad tiene su propio servicio de cotejo (ValidarQR para
// Veri*Factu, ValidarQRNoVerifactu para No Veri*Factu).
//
// Confirmado el 27/09 contra el documento oficial de la AEAT "Detalle de las
// especificaciones técnicas del código QR de la factura y de la URL del
// servicio de cotejo", versión 0.5.0 (10/12/2025), apartado de URLs: el
// dominio de producción es www2.agenciatributaria.gob.es (antes aquí .es).
const AEAT_QR_BASE = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT';
export const AEAT_QR_SERVICIO: Record<FiscalPdfData['modalidad'], string> = {
  verifactu: `${AEAT_QR_BASE}/ValidarQR`,
  no_verifactu: `${AEAT_QR_BASE}/ValidarQRNoVerifactu`,
};

/** Tamaño impreso del QR. La norma pide entre 30 y 40 mm (antes: 26). */
export const QR_TRIBUTARIO_MM = 32;

/**
 * DD-MM-AAAA a partir de la fecha de emisión (AAAA-MM-DD), sin pasar por
 * Date: new Date('2026-09-26') es medianoche UTC, y en un navegador con huso
 * horario negativo (América) daba el día anterior en el QR.
 */
export const fechaParaQr = (fechaEmision: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaEmision);
  if (!m) throw new Error(`Fecha de emisión no válida para el QR: ${fechaEmision}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
};

export const construirUrlQrTributario = (datos: {
  nif: string;
  numeroFactura: string;
  fechaEmision: string;
  totalCents: number;
  modalidad: FiscalPdfData['modalidad'];
}): string => {
  const params = new URLSearchParams({
    nif: datos.nif || '',
    numserie: datos.numeroFactura,
    fecha: fechaParaQr(datos.fechaEmision),
    importe: (datos.totalCents / 100).toFixed(2),
  });
  return `${AEAT_QR_SERVICIO[datos.modalidad]}?${params.toString()}`;
};

async function buildInvoiceQrDataUrl(profile: Profile, invoice: Invoice, fiscal: FiscalPdfData): Promise<string> {
  const qrUrl = construirUrlQrTributario({
    nif: fiscal.nifEmisor || profile.tax_id || '',
    numeroFactura: invoice.invoice_number.trim(),
    fechaEmision: invoice.issue_date,
    totalCents: fiscal.importeTotalCents ?? invoice.total_cents,
    modalidad: fiscal.modalidad,
  });
  // Nivel de corrección M e ISO/IEC 18004, como exige la Orden HAC/1177/2024.
  return QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', margin: 2, width: 400 });
}

// CAMBIO: se extrae TODO el dibujo del PDF de factura a esta función interna,
// que devuelve el objeto `jsPDF` sin guardarlo/descargarlo. Antes esta lógica
// vivía directamente dentro de `generateInvoicePdf` y terminaba siempre en
// `doc.save(...)`, lo que hacía imposible obtener los bytes para adjuntar en
// un email real (mailto: nunca pudo adjuntar archivos — limitación del
// navegador/SO, no del código, como ya se documentó aquí antes).
/** Datos extra del PDF: número de la factura que rectifica, si es rectificativa. */
export interface OpcionesPdfFactura {
    rectificaA?: string | null;
}

/** Título del documento según el tipo de factura y la modalidad fiscal. */
export const tituloDeFactura = (invoice: Pick<Invoice, 'rectifies_invoice_id'>, modalidad?: FiscalPdfData['modalidad'] | null): string => {
    const base = invoice.rectifies_invoice_id ? 'FACTURA RECTIFICATIVA' : 'FACTURA';
    return modalidad === 'verifactu' ? `${base} (VERI*FACTU)` : base;
};

async function buildInvoicePdfDocument(
    invoice: Invoice,
    client: Client,
    profile: Profile,
    fiscalData?: FiscalPdfData | null,
    opciones: OpcionesPdfFactura = {}
): Promise<jsPDF> {
    const autoTable = resolveAutoTable();
    const doc = new jsPDF();

    // Cálculos dinámicos basados en los items reales
    const totals = calculateInvoiceTotals(
        invoice.items,
        invoice.tax_percent || 0,
        invoice.irpf_percent || 0
    );

    // --- QR tributario (obligatorio si el cumplimiento Veri*Factu está
    // activo) — según la norma debe ir arriba del todo, antes que el resto
    // del contenido, por eso se pinta primero y se desplaza el resto del
    // header a la derecha para dejarle sitio.
    // CAMBIO (26/09): QR de 32 mm (la norma pide 30-40; antes 26) y textos a
    // 10 pt, el mismo tamaño que el resto de datos de la factura (antes 6 pt;
    // la norma pide igual o mayor). En Veri*Factu, la leyenda abreviada
    // "VERI*FACTU" que admite la norma: la larga a 10 pt no cabe bajo el QR.
    let headerLeftX = 14;
    if (fiscalData) {
        try {
            const qrDataUrl = await buildInvoiceQrDataUrl(profile, invoice, fiscalData);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            // Encima del QR y centrado respecto a él, como recomienda la AEAT.
            doc.text('QR tributario:', 14 + QR_TRIBUTARIO_MM / 2, 10, { align: 'center' });
            doc.addImage(qrDataUrl, 'PNG', 14, 12, QR_TRIBUTARIO_MM, QR_TRIBUTARIO_MM);
            if (fiscalData.modalidad === 'verifactu') {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text('VERI*FACTU', 14 + QR_TRIBUTARIO_MM / 2, 12 + QR_TRIBUTARIO_MM + 5, { align: 'center' });
                doc.setFont('helvetica', 'normal');
            }
            headerLeftX = 14 + QR_TRIBUTARIO_MM + 6;
        } catch (e) {
            console.error('No se pudo generar el QR tributario:', e);
        }
    }

    // --- Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(profile.business_name || profile.full_name, headerLeftX, 22);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(profile.full_name, headerLeftX, 30);
    doc.text(`NIF/CIF: ${profile.tax_id}`, headerLeftX, 35);
    doc.text(profile.email, headerLeftX, 40);

    // --- Invoice Info ---
    const esRectificativa = !!invoice.rectifies_invoice_id;
    doc.setFontSize(esRectificativa ? 13 : 16);
    doc.setFont('helvetica', 'bold');
    doc.text(tituloDeFactura(invoice, fiscalData?.modalidad), 200, 22, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nº: ${invoice.invoice_number}`, 200, 30, { align: 'right' });
    doc.text(`Fecha: ${invoice.issue_date}`, 200, 35, { align: 'right' });
    doc.text(`Vencimiento: ${invoice.due_date || invoice.issue_date}`, 200, 40, { align: 'right' });
    if (esRectificativa) {
        doc.text(`Rectifica a la factura: ${opciones.rectificaA || '—'}`, 200, 45, { align: 'right' });
        if (invoice.motivo_rectificacion) {
            const motivo = doc.splitTextToSize(`Motivo: ${invoice.motivo_rectificacion}`, 90);
            doc.text(motivo.slice(0, 3), 200, 50, { align: 'right' });
        }
    }

    // --- Client Info ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Facturar a:', 14, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(client.name, 14, 65);
    doc.text(client.company || '', 14, 70);
    doc.text(client.email, 14, 75);
    if(client.tax_id) doc.text(`NIF/CIF: ${client.tax_id}`, 14, 80);
    // NIF-IVA europeo: obligatorio en las facturas sin IVA a empresas de la UE.
    if (client.nif_iva) doc.text(`NIF-IVA: ${client.nif_iva}`, 14, client.tax_id ? 85 : 80);

    // --- Table ---
    const tableColumn = ["Descripción", "Cant.", "Precio", "Total"];
    const tableRows = invoice.items.map(item => [
        item.description,
        item.quantity,
        formatCurrency(item.price_cents),
        formatCurrency(item.price_cents * item.quantity),
    ]);

    autoTable(doc, {
        startY: 95,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: profile.pdf_color || '#d9009f' },
    });

    // --- Totals Section ---
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const labelX = 160;
    const valueX = 200;

    doc.setFontSize(10);
    doc.text('Subtotal:', labelX, finalY, { align: 'right' });
    doc.text(formatCurrency(totals.subtotal), valueX, finalY, { align: 'right' });

    doc.text(`IVA (${invoice.tax_percent}%):`, labelX, finalY + 7, { align: 'right' });
    doc.text(formatCurrency(totals.taxAmount), valueX, finalY + 7, { align: 'right' });

    let currentY = finalY + 14;

    if (totals.irpfAmount > 0) {
        doc.text(`IRPF (-${invoice.irpf_percent}%):`, labelX, currentY, { align: 'right' });
        doc.text(`-${formatCurrency(totals.irpfAmount)}`, valueX, currentY, { align: 'right' });
        currentY += 7;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL:', labelX, currentY, { align: 'right' });
    doc.text(formatCurrency(totals.total), valueX, currentY, { align: 'right' });

    // --- Mención legal de la factura sin IVA (RD 1619/2012, art. 6.1.j/m) ---
    const mencion = mencionSinIva(invoice.motivo_sin_iva);
    if (mencion) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(doc.splitTextToSize(mencion, 182), 14, currentY + 12);
    }

    // --- Footer ---
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Documento generado automáticamente.', 14, 285);
    if (fiscalData) {
        doc.setFontSize(6);
        doc.text(`Huella: ${fiscalData.hash}`, 14, 290);
    }

    return doc;
}

// Comportamiento IDÉNTICO al de antes: genera y fuerza la descarga del PDF.
// Usado por el botón "Descargar PDF" — sin cambios funcionales, solo delega
// el dibujo a buildInvoicePdfDocument().
export const generateInvoicePdf = async (invoice: Invoice, client: Client, profile: Profile, fiscalData?: FiscalPdfData | null, opciones: OpcionesPdfFactura = {}) => {
    const doc = await buildInvoicePdfDocument(invoice, client, profile, fiscalData, opciones);
    doc.save(`Factura-${invoice.invoice_number}.pdf`);
};

// CAMBIO: NUEVO. Genera el mismo PDF pero devuelve el contenido en base64
// (sin el prefijo `data:application/pdf;base64,`) listo para mandarlo como
// adjunto a la Edge Function `send-document-email`. No descarga nada ni
// toca el DOM — solo genera bytes en memoria.
export const generateInvoicePdfBase64 = async (
    invoice: Invoice,
    client: Client,
    profile: Profile,
    fiscalData?: FiscalPdfData | null,
    opciones: OpcionesPdfFactura = {}
): Promise<string> => {
    const doc = await buildInvoicePdfDocument(invoice, client, profile, fiscalData, opciones);
    const dataUri = doc.output('datauristring'); // "data:application/pdf;base64,JVBERi0xLjMK..."
    return dataUri.split(',')[1];
};

// CAMBIO: extraído de ContractsPage.tsx (handleDownload), que antes hacía un
// `import('jspdf')` dinámico dentro del propio componente. Se centraliza aquí
// para poder reutilizar el mismo dibujo tanto al descargar como al adjuntar
// en el email de "Enviar contrato" (que antes solo mandaba el link, sin PDF).
function buildContractPdfDocument(contract: Contract): jsPDF {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const ancho = pageWidth - margin * 2;
    const alto = 5;
    let y = 22;

    // Antes se pintaba todo el texto de golpe en una sola página: un contrato
    // de más de una página salía cortado. Ahora se pagina línea a línea, con
    // los títulos (líneas en mayúsculas) en negrita y numeración al pie.
    const saltoSiHaceFalta = (lineas: number) => {
        if (y + lineas * alto > pageHeight - 20) { doc.addPage(); y = 22; }
    };
    const esTitulo = (t: string) => t.length > 3 && t.length < 90 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t);

    const parrafos = String(contract.content ?? '').replace(/\r\n/g, '\n').split('\n');
    parrafos.forEach((parrafo, i) => {
        const texto = parrafo.trimEnd();
        if (!texto.trim()) { y += alto * 0.6; return; }
        const titulo = esTitulo(texto.trim());
        doc.setFont('helvetica', titulo ? 'bold' : 'normal');
        doc.setFontSize(i === 0 && titulo ? 13 : 10);
        const lineas = doc.splitTextToSize(texto, ancho) as string[];
        if (titulo) saltoSiHaceFalta(lineas.length + 2);
        for (const linea of lineas) {
            saltoSiHaceFalta(1);
            doc.text(linea, i === 0 && titulo ? pageWidth / 2 : margin, y, i === 0 && titulo ? { align: 'center' } : undefined);
            y += alto;
        }
        if (titulo) y += 1;
    });

    if (contract.status === 'signed' && contract.signed_by) {
        saltoSiHaceFalta(3);
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`Firmado electrónicamente por ${contract.signed_by}${contract.signed_at ? ' el ' + String(contract.signed_at).slice(0, 10) : ''}.`, margin, y);
    }

    const paginas = doc.getNumberOfPages();
    for (let n = 1; n <= paginas; n++) {
        doc.setPage(n);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Página ${n} de ${paginas}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.setTextColor(0, 0, 0);
    }
    return doc;
}

// Comportamiento idéntico al handleDownload original: descarga el PDF.
export const generateContractPdf = (contract: Contract, projectName?: string) => {
    const doc = buildContractPdfDocument(contract);
    doc.save(`Contrato_${projectName || 'Servicios'}.pdf`);
};

// NUEVO: devuelve el PDF en base64 para adjuntarlo al email de envío del contrato.
export const generateContractPdfBase64 = (contract: Contract): string => {
    const doc = buildContractPdfDocument(contract);
    const dataUri = doc.output('datauristring');
    return dataUri.split(',')[1];
};

// NUEVO: recibo de pago suelto (no ligado a una factura formal). Pensado
// para trabajos informales o cobros parciales de los que el cliente quiere
// una constancia por escrito, sin generar un documento fiscal numerado
// como las facturas — por eso lleva un aviso explícito de que NO es una
// factura, para que no se confunda con un justificante válido ante la AEAT.
function buildReceiptPdfDocument(receipt: Receipt, clientName: string, profile: Profile): jsPDF {
    const doc = new jsPDF();

    // --- Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(profile.business_name || profile.full_name, 14, 22);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(profile.full_name, 14, 30);
    if (profile.tax_id) doc.text(`NIF/CIF: ${profile.tax_id}`, 14, 35);
    doc.text(profile.email, 14, 40);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO', 200, 22, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nº: ${receipt.receipt_number}`, 200, 30, { align: 'right' });
    doc.text(`Fecha: ${receipt.paid_at}`, 200, 35, { align: 'right' });

    // --- Aviso: no es una factura ---
    doc.setFillColor(255, 247, 224);
    doc.rect(14, 50, 182, 12, 'F');
    doc.setFontSize(8);
    doc.setTextColor(150, 100, 0);
    doc.text('Este documento es un recibo de pago y no tiene la consideración de factura.', 18, 57);
    doc.setTextColor(0, 0, 0);

    // --- Recibí de ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Recibí de:', 14, 75);
    doc.setFont('helvetica', 'normal');
    doc.text(clientName, 14, 81);

    // --- Concepto e importe ---
    doc.setFont('helvetica', 'bold');
    doc.text('En concepto de:', 14, 95);
    doc.setFont('helvetica', 'normal');
    const conceptLines = doc.splitTextToSize(receipt.concept, 180);
    doc.text(conceptLines, 14, 101);

    const amountY = 101 + conceptLines.length * 6 + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Importe recibido:', 14, amountY);
    doc.text(formatCurrency(receipt.amount_cents), 200, amountY, { align: 'right' });

    if (receipt.method) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Método de pago: ${receipt.method}`, 14, amountY + 10);
    }
    if (receipt.notes) {
        doc.setFontSize(9);
        const notesLines = doc.splitTextToSize(`Notas: ${receipt.notes}`, 180);
        doc.text(notesLines, 14, amountY + (receipt.method ? 18 : 10));
    }

    // --- Footer ---
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Documento generado automáticamente. No sustituye una factura.', 14, 285);

    return doc;
}

export const generateReceiptPdf = (receipt: Receipt, clientName: string, profile: Profile) => {
    buildReceiptPdfDocument(receipt, clientName, profile).save(`Recibo-${receipt.receipt_number}.pdf`);
};

/** El mismo recibo en base64, para adjuntarlo al email. */
export const generateReceiptPdfBase64 = (receipt: Receipt, clientName: string, profile: Profile): string =>
    buildReceiptPdfDocument(receipt, clientName, profile).output('datauristring').split(',')[1];

// Presupuestos y propuestas: ver services/pdfOfertas.ts (rediseño del 28/09).
export { generateBudgetPdf, generateBudgetPdfBase64, generateProposalPdf, generateProposalPdfBase64 } from './pdfOfertas';

// FIX / NUEVO: exportación en PDF del "Libro Fiscal" (TaxLedgerPage.tsx).
// Antes solo existía exportación a CSV (útil para pegar en Excel, pero poco
// presentable). Este PDF está pensado para que el freelancer se lo lleve
// directamente a su gestoría, o lo guarde como justificante propio — con la
// misma cabecera de marca que las facturas, y un aviso legal bien visible de
// que es una estimación, no una declaración oficial ya presentada.
interface TaxReportTotals {
    totalIngresos: number;
    /** Parte de los ingresos sin IVA español (clientes UE / fuera de la UE). */
    baseSinIva?: number;
    totalGastos: number;
    beneficio: number;
    ivaRepercutido: number;
    ivaSoportado: number;
    ivaAPagar: number;
    totalRetenciones: number;
    irpfAPagar: number;
}

export const generateTaxReportPdf = (
    profile: Profile,
    year: number,
    quarter: number | 'annual',
    irpfPercentage: number,
    totals: TaxReportTotals
) => {
    const autoTable = resolveAutoTable();
    const doc = new jsPDF();
    const periodLabel = quarter === 'annual' ? `Año completo ${year}` : `${quarter}º Trimestre ${year}`;

    // --- Header (mismo estilo que las facturas, para coherencia de marca) ---
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(profile.business_name || profile.full_name, 14, 22);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(profile.full_name, 14, 30);
    if (profile.tax_id) doc.text(`NIF/CIF: ${profile.tax_id}`, 14, 35);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BORRADOR FISCAL', 200, 22, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periodo: ${periodLabel}`, 200, 30, { align: 'right' });
    doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, 200, 35, { align: 'right' });

    // --- Aviso legal (bien visible, arriba del todo) ---
    doc.setFillColor(255, 247, 224);
    doc.rect(14, 45, 182, 16, 'F');
    doc.setFontSize(8);
    doc.setTextColor(150, 100, 0);
    doc.text(
        'Este documento es una ESTIMACIÓN calculada a partir de tus facturas y gastos registrados.',
        18, 51
    );
    doc.text(
        'No sustituye la presentación oficial ante la AEAT. Revísalo con tu gestoría antes de presentar.',
        18, 56
    );
    doc.setTextColor(0, 0, 0);

    // --- Resumen general ---
    autoTable(doc, {
        startY: 68,
        head: [['Resumen del trimestre', '']],
        body: [
            ['Ingresos (base imponible)', formatCurrency(totals.totalIngresos)],
            ...(totals.baseSinIva ? [['   de ellos, sin IVA español (clientes de otro país)', formatCurrency(totals.baseSinIva)]] : []),
            ['Gastos (base imponible)', formatCurrency(totals.totalGastos)],
            ['Beneficio neto', formatCurrency(totals.beneficio)],
        ],
        theme: 'striped',
        headStyles: { fillColor: profile.pdf_color || '#d9009f' },
        columnStyles: { 1: { halign: 'right' } },
    });

    // --- Modelo 303 (IVA) ---
    const y1 = (doc as any).lastAutoTable.finalY + 10;
    autoTable(doc, {
        startY: y1,
        head: [['Modelo 303 · Liquidación de IVA', '']],
        body: [
            ['IVA Repercutido (+)', formatCurrency(totals.ivaRepercutido)],
            ['IVA Soportado (-)', formatCurrency(totals.ivaSoportado)],
            [
                { content: totals.ivaAPagar >= 0 ? 'A INGRESAR' : 'A DEVOLVER', styles: { fontStyle: 'bold' } },
                { content: formatCurrency(Math.abs(totals.ivaAPagar)), styles: { fontStyle: 'bold' } },
            ],
        ],
        theme: 'striped',
        headStyles: { fillColor: profile.pdf_color || '#d9009f' },
        columnStyles: { 1: { halign: 'right' } },
    });

    // --- Modelo 130 (IRPF) ---
    const y2 = (doc as any).lastAutoTable.finalY + 10;
    autoTable(doc, {
        startY: y2,
        head: [[`Modelo 130 · Pago Fraccionado IRPF (${irpfPercentage}%)`, '']],
        body: [
            ['Cuota íntegra', formatCurrency(totals.beneficio > 0 ? totals.beneficio * (irpfPercentage / 100) : 0)],
            ['Retenciones ya soportadas (-)', formatCurrency(totals.totalRetenciones)],
            [
                { content: 'A INGRESAR', styles: { fontStyle: 'bold' } },
                { content: formatCurrency(totals.irpfAPagar), styles: { fontStyle: 'bold' } },
            ],
        ],
        theme: 'striped',
        headStyles: { fillColor: profile.pdf_color || '#d9009f' },
        columnStyles: { 1: { halign: 'right' } },
    });

    // --- Footer ---
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
        'Documento generado automáticamente por DevFreelancer a partir de los datos introducidos por el usuario. No tiene validez como declaración oficial.',
        14, 285
    );

    doc.save(quarter === 'annual' ? `Borrador-Fiscal-${year}-Anual.pdf` : `Borrador-Fiscal-${year}-T${quarter}.pdf`);
};
