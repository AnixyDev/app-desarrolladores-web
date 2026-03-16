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