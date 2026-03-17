// services/pdfService.ts
import type { Invoice, Client, Profile } from '@/types';
import { formatCurrency, calculateInvoiceTotals } from '@/lib/utils';

export const generateInvoicePdf = async (invoice: Invoice, client: Client, profile: Profile) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

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