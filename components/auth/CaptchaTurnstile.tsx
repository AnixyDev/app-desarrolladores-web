import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY, captchaActivo } from '@/lib/captcha';

/**
 * Widget de Cloudflare Turnstile, sin dependencias.
 *
 * Cada token vale UNA sola vez: Supabase lo gasta al verificarlo, acierte o
 * falle la contraseña. Por eso, tras cada intento, el formulario llama a
 * `reiniciar()` — si no, el segundo intento iría con un token ya usado y
 * fallaría con un "captcha" que el usuario no entendería.
 */

declare global {
    interface Window {
        turnstile?: {
            render: (el: HTMLElement, opciones: Record<string, unknown>) => string;
            reset: (id?: string) => void;
            remove: (id?: string) => void;
        };
    }
}

const URL_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Una sola carga del script para toda la aplicación, aunque se monten varios
// formularios seguidos (login → registro → login).
let cargaDelScript: Promise<void> | null = null;

const cargarScript = (): Promise<void> => {
    if (window.turnstile) return Promise.resolve();
    if (cargaDelScript) return cargaDelScript;

    cargaDelScript = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = URL_SCRIPT;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => {
            // Permitir reintentar en el siguiente montaje (p. ej. sin red un momento).
            cargaDelScript = null;
            script.remove();
            reject(new Error('No se pudo cargar el CAPTCHA'));
        };
        document.head.appendChild(script);
    });
    return cargaDelScript;
};

export interface CaptchaTurnstileHandle {
    reiniciar: () => void;
}

interface Props {
    /** Recibe el token, o `null` cuando caduca, falla o se reinicia. */
    onToken: (token: string | null) => void;
    className?: string;
}

const CaptchaTurnstile = forwardRef<CaptchaTurnstileHandle, Props>(({ onToken, className }, ref) => {
    const contenedor = useRef<HTMLDivElement>(null);
    const idWidget = useRef<string | null>(null);
    const [errorDeCarga, setErrorDeCarga] = useState(false);

    // El callback cambia en cada render del formulario; el widget se crea una
    // sola vez, así que lee siempre la versión actual desde una ref.
    const onTokenActual = useRef(onToken);
    onTokenActual.current = onToken;

    useImperativeHandle(ref, () => ({
        reiniciar: () => {
            onTokenActual.current(null);
            if (idWidget.current && window.turnstile) window.turnstile.reset(idWidget.current);
        },
    }));

    useEffect(() => {
        if (!captchaActivo()) return;
        let cancelado = false;

        cargarScript()
            .then(() => {
                if (cancelado || !contenedor.current || !window.turnstile) return;
                idWidget.current = window.turnstile.render(contenedor.current, {
                    sitekey: TURNSTILE_SITE_KEY,
                    theme: 'dark',
                    language: 'es',
                    callback: (token: string) => onTokenActual.current(token),
                    'expired-callback': () => onTokenActual.current(null),
                    'error-callback': () => onTokenActual.current(null),
                });
            })
            .catch(() => {
                if (!cancelado) setErrorDeCarga(true);
            });

        return () => {
            cancelado = true;
            if (idWidget.current && window.turnstile) window.turnstile.remove(idWidget.current);
            idWidget.current = null;
        };
    }, []);

    if (!captchaActivo()) return null;

    return (
        <div className={className}>
            <div ref={contenedor} className="flex justify-center min-h-[65px]" />
            {errorDeCarga && (
                <p className="mt-1 text-center text-xs text-red-400">
                    No se pudo cargar la comprobación de seguridad. Revisa tu conexión o desactiva el bloqueador de anuncios y recarga la página.
                </p>
            )}
        </div>
    );
});

CaptchaTurnstile.displayName = 'CaptchaTurnstile';

export default CaptchaTurnstile;
