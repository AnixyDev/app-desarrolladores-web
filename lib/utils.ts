
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

// A robust client-side JWT decoder that handles UTF-8 characters correctly.
export const jwtDecode = <T,>(token: string): T | null => {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) {
            console.error("Invalid JWT: No payload specified.");
            return null;
        }
        // Replace URL-specific characters and add padding if missing.
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const paddedBase64 = base64 + '=='.substring(0, (4 - base64.length % 4) % 4);

        // Decode from base64 to a binary string.
        const binaryStr = atob(paddedBase64);
        
        // Convert the binary string to a Uint8Array.
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }

        // Use TextDecoder to correctly handle UTF-8 characters.
        const jsonPayload = new TextDecoder().decode(bytes);

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to decode JWT:", e);
        return null;
    }
};
