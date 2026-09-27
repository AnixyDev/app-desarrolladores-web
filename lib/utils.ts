// lib/utils.ts

// Usado tanto por /my-timesheet como por el widget global del cronómetro,
// para que el formato HH:MM:SS sea idéntico se muestre donde se muestre.
export const formatDuration = (totalSeconds: number): string => {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

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
 * Fecha en formato español (27/09/2026), para toda la app.
 *
 * - "AAAA-MM-DD" (columnas date de Postgres) se formatea a partir del texto,
 *   sin pasar por Date: new Date('2026-09-27') es medianoche UTC y en un
 *   navegador de América mostraba el día anterior.
 * - Fechas con hora (timestamptz) se muestran en la hora local.
 * - Vacío o no válido: "—".
 *
 * Antes se usaba toLocaleDateString() sin idioma, que en un navegador
 * configurado en inglés enseñaba "9/27/2026".
 */
export const formatearFecha = (valor?: string | number | Date | null): string => {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'string') {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Fecha y hora en formato español (27/09/2026, 15:40). */
export const formatearFechaHora = (valor?: string | number | Date | null): string => {
    if (valor === null || valor === undefined || valor === '') return '—';
    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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