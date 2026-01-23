// FIX: Remove .ts extension from import to fix module resolution error.
import type { Invoice, Client, Profile } from '../types';

const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
};

export const generateInvoicePdf = async (invoice: Invoice, client: Client, profile: Profile) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();
    
    // --- Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(profile.business_name, 14, 22);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(profile.full_name, 14, 30);
    doc.text(profile.tax_id, 14, 35);
    doc.text(profile.email, 14, 40);

    // --- Invoice Info ---
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`FACTURA`, 200, 22, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nº: ${invoice.invoice_number}`, 200, 30, { align: 'right' });
    doc.text(`Fecha: ${invoice.issue_date}`, 200, 35, { align: 'right' });
    doc.text(`Vencimiento: ${invoice.due_date}`, 200, 40, { align: 'right' });

    // --- Client Info ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Facturar a:', 14, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(client.name, 14, 65);
    doc.text(client.company || '', 14, 70);
    doc.text(client.email, 14, 75);
    if(client.tax_id) doc.text(client.tax_id, 14, 80);
    if(client.address) doc.text(client.address, 14, 85);

    // --- Table ---
    const tableColumn = ["Descripción", "Cantidad", "Precio Unitario", "Total"];
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
        headStyles: { fillColor: profile.pdf_color || '#d9009f' }, // Use Pro color
    });

    // --- Totals ---
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const labelX = 170;
    const valueX = 200;
    
    const subtotal = invoice.subtotal_cents;
    const ivaAmount = invoice.total_cents - invoice.subtotal_cents;
    // Calculate IRPF if present.
    const irpfAmount = invoice.irpf_percent ? Math.round(subtotal * (invoice.irpf_percent / 100)) : 0;
    const finalTotal = invoice.total_cents - irpfAmount;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    doc.text('Subtotal:', labelX, finalY, { align: 'right' });
    doc.text(formatCurrency(subtotal), valueX, finalY, { align: 'right' });

    doc.text(`IVA (${invoice.tax_percent}%):`, labelX, finalY + 7, { align: 'right' });
    doc.text(formatCurrency(ivaAmount), valueX, finalY + 7, { align: 'right' });
    
    let currentY = finalY + 14;
    
    if (invoice.irpf_percent && invoice.irpf_percent > 0) {
        doc.text(`Retención IRPF (${invoice.irpf_percent}%):`, labelX, currentY, { align: 'right' });
        doc.text(`-${formatCurrency(irpfAmount)}`, valueX, currentY, { align: 'right' });
        currentY += 7;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL A PAGAR:', labelX, currentY, { align: 'right' });
    doc.text(formatCurrency(finalTotal), valueX, currentY, { align: 'right' });
    
    // --- Footer ---
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Gracias por su confianza.', 14, 280);
    
    doc.save(`Factura-${invoice.invoice_number}.pdf`);
};