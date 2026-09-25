// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Clave pública de Cloudflare Turnstile. Vacía = sin CAPTCHA (local, CI). */
    readonly VITE_TURNSTILE_SITE_KEY?: string;
}
