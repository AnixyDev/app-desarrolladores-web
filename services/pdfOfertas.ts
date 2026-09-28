// PDF de presupuestos y propuestas (rediseño del 28/09/2026).
//
// Antes: una cabecera con el nombre, el asunto y una tabla sin totales con
// IVA. Ahora es un documento comercial completo, pensado para que el cliente
// lo acepte:
//  - banda de color con la marca del freelancer (pdf_color de Ajustes) y
//    referencia del documento;
//  - bloques "De" / "Para" con NIF, domicilio y correo;
//  - alcance (texto de la propuesta), tabla de conceptos, y resumen con base,
//    IVA estimado y total;
//  - condiciones: validez, forma de pago, qué incluye el precio;
//  - cómo aceptarlo (enlace al portal) y recuadro de firma de aceptación;
//  - pie con contacto y "Página X de Y" en cada página.
// No son documentos fiscales: no llevan serie de facturación.

import jsPDF from 'jspdf';
import * as autoTableNamespace from 'jspdf-autotable';
import type { Budget, Proposal, Profile, Client } from '@/types';
import { formatCurrency } from '@/lib/utils';

function resolveAutoTable(): (doc: jsPDF, options: any) => void {
    const ns = autoTableNamespace as any;
    const fn = [ns, ns?.default, ns?.default?.default, ns?.autoTable].find(c => typeof c === 'function');
    if (!fn) throw new Error('No se pudo cargar la librería jspdf-autotable.');
    return fn;
}

/** Datos del cliente que salen en el documento (vale un Client completo). */
export type ClienteDelDocumento = Pick<Client, 'name'> & Partial<Pick<Client, 'company' | 'tax_id' | 'address' | 'email'>>;

type Linea = { description: string; quantity: number; price_cents: number };

export interface DocumentoComercial {
    tipo: 'PRESUPUESTO' | 'PROPUESTA';
    referencia: string;
    asunto: string;
    fecha: string;             // AAAA-MM-DD…
    validoHasta: string;       // AAAA-MM-DD
    texto?: string | null;     // alcance / descripción larga
    items: Linea[];
    importeCents: number;      // base imponible
    ivaPercent: number;
    enlacePortal?: string | null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '';
};

/** Suma días a una fecha AAAA-MM-DD sin husos horarios. */
export const sumarDias = (iso: string, dias: number): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    const base = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.now();
    return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
};

/** "#d9009f" → [217, 0, 159]; si no es un color válido, el rosa de la marca. */
export const colorRgb = (hex?: string | null): [number, number, number] => {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    const v = m ? m[1] : 'd9009f';
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

/** Referencia corta y estable a partir del id: PRES-2026-3F9A1C. */
export const referenciaDe = (prefijo: string, id: string, fecha: string): string =>
    `${prefijo}-${(fecha || '').slice(0, 4) || new Date().getFullYear()}-${(id || '').replace(/-/g, '').slice(0, 6).toUpperCase()}`;

/** Líneas del documento: las del presupuesto, o una sola con el importe. */
export const lineasDe = (items: Linea[] | null | undefined, asunto: string, importeCents: number): Linea[] =>
    items && items.length > 0 ? items : [{ description: asunto, quantity: 1, price_cents: importeCents }];

export const totalesDe = (baseCents: number, ivaPercent: number) => {
    const iva = Math.round(baseCents * ivaPercent / 100);
    return { base: baseCents, iva, total: baseCents + iva };
};

const domicilioDe = (p: Profile) =>
    [p.fiscal_street, [p.fiscal_postal_code, p.fiscal_city].filter(Boolean).join(' '), p.fiscal_province]
        .map(x => (x ?? '').trim()).filter(Boolean).join(', ');

export function buildDocumentoComercial(d: DocumentoComercial, cliente: ClienteDelDocumento, perfil: Profile): jsPDF {
    const autoTable = resolveAutoTable();
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 16;
    const color = colorRgb(perfil.pdf_color);
    const marca = perfil.business_name || perfil.full_name || '';
    const gris: [number, number, number] = [110, 110, 110];

    // --- Banda de cabecera ---
    doc.setFillColor(...color);
    doc.rect(0, 0, W, 34, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(marca, M, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (perfil.business_name && perfil.full_name && perfil.business_name !== perfil.full_name) doc.text(perfil.full_name, M, 23);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(d.tipo, W - M, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Ref. ${d.referencia}`, W - M, 23, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // --- Fechas ---
    let y = 44;
    doc.setFontSize(9);
    doc.setTextColor(...gris);
    doc.text(`Fecha: ${fechaLarga(d.fecha)}`, M, y);
    doc.text(`Válido hasta: ${fechaLarga(d.validoHasta)}`, W - M, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // --- De / Para ---
    y += 8;
    const col = (W - M * 2) / 2;
    const bloque = (x: number, titulo: string, lineas: string[]) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...color);
        doc.text(titulo, x, y);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        let yy = y + 6;
        for (const l of lineas.filter(Boolean)) {
            const partes = doc.splitTextToSize(l, col - 6) as string[];
            doc.text(partes, x, yy);
            yy += partes.length * 5;
        }
        return yy;
    };
    const finDe = bloque(M, 'DE', [
        perfil.full_name,
        perfil.tax_id ? `NIF: ${perfil.tax_id}` : '',
        domicilioDe(perfil),
        perfil.invoice_reply_to_email || perfil.email,
    ]);
    const finPara = bloque(M + col, 'PARA', [
        cliente.company && cliente.company !== cliente.name ? `${cliente.name} (${cliente.company})` : cliente.name,
        cliente.tax_id ? `NIF/CIF: ${cliente.tax_id}` : '',
        cliente.address || '',
        cliente.email || '',
    ]);
    y = Math.max(finDe, finPara) + 4;

    // --- Asunto ---
    doc.setDrawColor(230, 230, 230);
    doc.line(M, y, W - M, y);
    y += 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const asunto = doc.splitTextToSize(d.asunto, W - M * 2) as string[];
    doc.text(asunto, M, y);
    y += asunto.length * 6 + 3;

    const saltoSiHaceFalta = (alto: number) => {
        if (y + alto > H - 22) { doc.addPage(); y = 20; }
    };

    // --- Alcance ---
    if (d.texto && d.texto.trim()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...color);
        saltoSiHaceFalta(10);
        doc.text('ALCANCE DEL TRABAJO', M, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        for (const parrafo of d.texto.replace(/\r\n/g, '\n').split('\n')) {
            if (!parrafo.trim()) { y += 3; continue; }
            for (const linea of doc.splitTextToSize(parrafo, W - M * 2) as string[]) {
                saltoSiHaceFalta(5);
                doc.text(linea, M, y);
                y += 5;
            }
        }
        y += 4;
    }

    // --- Conceptos ---
    saltoSiHaceFalta(30);
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, bottom: 22 },
        head: [['Concepto', 'Cant.', 'Precio', 'Importe']],
        body: d.items.map(i => [i.description, String(i.quantity), formatCurrency(i.price_cents), formatCurrency(Math.round(i.price_cents * i.quantity))]),
        theme: 'grid',
        headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9.5, cellPadding: 3, lineColor: [230, 230, 230] },
        columnStyles: { 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 32 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // --- Totales ---
    const t = totalesDe(d.importeCents, d.ivaPercent);
    saltoSiHaceFalta(26);
    const xEt = W - M - 60;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Base imponible', xEt, y);
    doc.text(formatCurrency(t.base), W - M, y, { align: 'right' });
    y += 6;
    doc.text(`IVA (${d.ivaPercent} %)`, xEt, y);
    doc.text(formatCurrency(t.iva), W - M, y, { align: 'right' });
    y += 3;
    doc.setFillColor(...color);
    doc.rect(xEt - 3, y, 63 + 0, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL', xEt, y + 6.2);
    doc.text(formatCurrency(t.total), W - M - 1, y + 6.2, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 16;

    // --- Condiciones ---
    const condiciones = [
        `Este ${d.tipo === 'PRESUPUESTO' ? 'presupuesto' : 'propuesta'} es válido hasta el ${fechaLarga(d.validoHasta)}.`,
        'Forma de pago: 50 % al aceptar y 50 % a la entrega, mediante transferencia bancaria o pago con tarjeta desde el enlace de cada factura.',
        'El IVA se aplica al tipo vigente. Si el cliente es empresa o profesional, en la factura se practicará la retención de IRPF que corresponda.',
        'Cualquier trabajo no descrito en este documento se presupuestará aparte.',
    ];
    saltoSiHaceFalta(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...color);
    doc.text('CONDICIONES', M, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const c of condiciones) {
        const lineas = doc.splitTextToSize(`•  ${c}`, W - M * 2) as string[];
        saltoSiHaceFalta(lineas.length * 4.5);
        doc.text(lineas, M, y);
        y += lineas.length * 4.5 + 1;
    }
    y += 4;

    // --- Aceptación ---
    // El enlace va en el texto (clicable), no escrito entero: una URL de
    // portal con el email ocupaba tres líneas.
    const altoCaja = 30;
    saltoSiHaceFalta(altoCaja + 2);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, W - M * 2, altoCaja, 2, 2, 'S');
    doc.setLineWidth(0.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ACEPTACIÓN', M + 5, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (d.enlacePortal) {
        const antes = 'Puedes aceptarlo ';
        const enlace = 'online desde tu portal de cliente';
        const despues = ', o firmar este documento y devolverlo.';
        let x = M + 5;
        doc.text(antes, x, y + 13);
        x += doc.getTextWidth(antes);
        doc.setTextColor(...color);
        doc.textWithLink(enlace, x, y + 13, { url: d.enlacePortal });
        doc.line(x, y + 13.6, x + doc.getTextWidth(enlace), y + 13.6);
        x += doc.getTextWidth(enlace);
        doc.setTextColor(0, 0, 0);
        doc.text(despues, x, y + 13);
    } else {
        doc.text('Para aceptarlo, firma este documento y devuélvelo, o responde al correo con tu conformidad.', M + 5, y + 13);
    }
    doc.setTextColor(...gris);
    doc.text('Nombre y firma del cliente:', M + 5, y + 24);
    doc.text('Fecha:', W / 2 + 20, y + 24);
    doc.setDrawColor(200, 200, 200);
    doc.line(M + 48, y + 25, W / 2 + 14, y + 25);
    doc.line(W / 2 + 32, y + 25, W - M - 6, y + 25);
    doc.setTextColor(0, 0, 0);

    // --- Pie en todas las páginas ---
    const paginas = doc.getNumberOfPages();
    for (let n = 1; n <= paginas; n++) {
        doc.setPage(n);
        doc.setDrawColor(230, 230, 230);
        doc.line(M, H - 16, W - M, H - 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...gris);
        doc.text([marca, perfil.invoice_reply_to_email || perfil.email].filter(Boolean).join('  ·  '), M, H - 10);
        doc.text(`Página ${n} de ${paginas}`, W - M, H - 10, { align: 'right' });
        doc.setTextColor(0, 0, 0);
    }
    return doc;
}

const PORTAL = () => (typeof window !== 'undefined' ? window.location.origin : 'https://devfreelancer.app');

export const datosDelPresupuesto = (b: Budget, correoCliente?: string | null): DocumentoComercial => {
    const fecha = (b.created_at || new Date().toISOString()).slice(0, 10);
    return {
        tipo: 'PRESUPUESTO',
        referencia: referenciaDe('PRES', b.id, fecha),
        asunto: b.description,
        fecha,
        validoHasta: sumarDias(fecha, 30),
        items: lineasDe(b.items, b.description, b.amount_cents),
        importeCents: b.amount_cents,
        ivaPercent: 21,
        enlacePortal: `${PORTAL()}/portal/budgets/${b.id}${correoCliente ? `?email=${encodeURIComponent(correoCliente)}` : ''}`,
    };
};

export const datosDeLaPropuesta = (p: Proposal, correoCliente?: string | null): DocumentoComercial => {
    const fecha = (p.created_at || new Date().toISOString()).slice(0, 10);
    return {
        tipo: 'PROPUESTA',
        referencia: referenciaDe('PROP', p.id, fecha),
        asunto: p.title,
        fecha,
        validoHasta: (p.valid_until || '').slice(0, 10) || sumarDias(fecha, 15),
        texto: p.content,
        items: lineasDe(p.items, p.title, p.amount_cents),
        importeCents: p.amount_cents,
        ivaPercent: 21,
        enlacePortal: `${PORTAL()}/portal/proposals/${p.id}${correoCliente ? `?email=${encodeURIComponent(correoCliente)}` : ''}`,
    };
};

const nombreSeguro = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'documento';

const base64 = (doc: jsPDF) => doc.output('datauristring').split(',')[1];

export const generateBudgetPdf = (b: Budget, cliente: ClienteDelDocumento, perfil: Profile) =>
    buildDocumentoComercial(datosDelPresupuesto(b, cliente.email), cliente, perfil).save(`Presupuesto-${nombreSeguro(b.description)}.pdf`);

export const generateBudgetPdfBase64 = (b: Budget, cliente: ClienteDelDocumento, perfil: Profile): string =>
    base64(buildDocumentoComercial(datosDelPresupuesto(b, cliente.email), cliente, perfil));

export const generateProposalPdf = (p: Proposal, cliente: ClienteDelDocumento, perfil: Profile) =>
    buildDocumentoComercial(datosDeLaPropuesta(p, cliente.email), cliente, perfil).save(`Propuesta-${nombreSeguro(p.title)}.pdf`);

export const generateProposalPdfBase64 = (p: Proposal, cliente: ClienteDelDocumento, perfil: Profile): string =>
    base64(buildDocumentoComercial(datosDeLaPropuesta(p, cliente.email), cliente, perfil));
