// services/pdfService.ts
import type { Invoice, Client, Profile } from '@/types';
import { formatCurrency, calculateInvoiceTotals } from '@/lib/utils';
import jsPDF from 'jspdf';
import * as autoTableNamespace from 'jspdf-autotable';

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

export const generateInvoicePdf = async (invoice: Invoice, client: Client, profile: Profile) => {
    const autoTable = resolveAutoTable();
    const doc = new jsPDF();
    
    // Cálculos dinámicos basados en los items reales
    const totals = calculateInvoiceTotals(
        invoice.items, 
        invoice.tax_percent || 0, 
        invoice.irpf_percent || 0
    );

    // --- Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(profile.business_name || profile.full_name, 14, 22);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(profile.full_name, 14, 30);
    doc.text(`NIF/CIF: ${profile.tax_id}`, 14, 35);
    doc.text(profile.email, 14, 40);

    // --- Invoice Info ---
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`FACTURA`, 200, 22, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nº: ${invoice.invoice_number}`, 200, 30, { align: 'right' });
    doc.text(`Fecha: ${invoice.issue_date}`, 200, 35, { align: 'right' });
    doc.text(`Vencimiento: ${invoice.due_date || invoice.issue_date}`, 200, 40, { align: 'right' });

    // --- Client Info ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Facturar a:', 14, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(client.name, 14, 65);
    doc.text(client.company || '', 14, 70);
    doc.text(client.email, 14, 75);
    if(client.tax_id) doc.text(`NIF/CIF: ${client.tax_id}`, 14, 80);

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
    
    // --- Footer ---
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Documento generado automáticamente.', 14, 285);
    
    doc.save(`Factura-${invoice.invoice_number}.pdf`);
};

// FIX / NUEVO: exportación en PDF del "Libro Fiscal" (TaxLedgerPage.tsx).
// Antes solo existía exportación a CSV (útil para pegar en Excel, pero poco
// presentable). Este PDF está pensado para que el freelancer se lo lleve
// directamente a su gestoría, o lo guarde como justificante propio — con la
// misma cabecera de marca que las facturas, y un aviso legal bien visible de
// que es una estimación, no una declaración oficial ya presentada.
interface TaxReportTotals {
    totalIngresos: number;
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
    quarter: number,
    irpfPercentage: number,
    totals: TaxReportTotals
) => {
    const autoTable = resolveAutoTable();
    const doc = new jsPDF();

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
    doc.text(`Periodo: ${quarter}º Trimestre ${year}`, 200, 30, { align: 'right' });
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

    doc.save(`Borrador-Fiscal-${year}-T${quarter}.pdf`);
};