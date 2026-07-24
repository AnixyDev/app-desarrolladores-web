// lib/utils.ts

export const formatCurrency = (cents: number): string => {
    if (typeof cents !== 'number') {
        console.warn('formatCurrency received a non-number value:', cents);
        return '€0.00';
    }
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
    }).format(cents / 100);
};

// FIX: fechapublicacion en jobs es una columna `date` real (antes el
// formulario mandaba el texto literal "Recién publicado", que Postgres
// rechazaba con "invalid input syntax for type date"). Ahora se guarda la
// fecha real y este helper decide cómo mostrarla: "Recién publicado" el
// mismo día, o la fecha formateada a partir de entonces.
export const formatJobPublishDate = (fechaPublicacion?: string | null): string => {
    if (!fechaPublicacion) return '';
    const published = new Date(fechaPublicacion);
    if (isNaN(published.getTime())) return fechaPublicacion;

    const today = new Date();
    const isSameDay = published.toDateString() === today.toDateString();
    if (isSameDay) return 'Recién publicado';

    return published.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Calcula los totales de una factura de forma centralizada.
 * Maneja céntimos para evitar errores de redondeo en JS.
 */
export const calculateInvoiceTotals = (
    items: { quantity: number; price_cents: number }[],
    taxPercent: number,
    irpfPercent: number = 0
) => {
    const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.price_cents), 0);
    const taxAmount = Math.round(subtotal * (taxPercent / 100));
    const irpfAmount = Math.round(subtotal * (irpfPercent / 100));
    const total = subtotal + taxAmount - irpfAmount;

    return {
        subtotal,
        taxAmount,
        irpfAmount,
        total
    };
};

export const jwtDecode = <T,>(token: string): T | null => {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const paddedBase64 = base64 + '=='.substring(0, (4 - base64.length % 4) % 4);
        const binaryStr = atob(paddedBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const jsonPayload = new TextDecoder().decode(bytes);
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to decode JWT:", e);
        return null;
    }
};