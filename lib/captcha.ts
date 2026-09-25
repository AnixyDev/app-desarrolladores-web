/**
 * CAPTCHA (Cloudflare Turnstile) para los formularios que crean cuentas o
 * mandan correos: login, registro, recuperar contraseña y portal del cliente.
 *
 * Por qué hace falta: `signUp`, `signInWithOtp` y `resetPasswordForEmail` son
 * llamadas directas a Supabase Auth con la clave anónima, que viaja en el
 * paquete porque tiene que viajar. Sin CAPTCHA, cualquiera puede crear cuentas
 * o disparar correos desde nuestro dominio con un `curl`. Quitar la llamada del
 * frontend no cambia nada; lo único que lo corta es que Supabase exija un token
 * que solo un navegador de verdad consigue.
 *
 * ORDEN DE ACTIVACIÓN — importa:
 *   1. Este código desplegado, con VITE_TURNSTILE_SITE_KEY en Vercel.
 *      Con el CAPTCHA apagado en Supabase, el token que mandamos se ignora.
 *   2. Solo entonces, activar el CAPTCHA en el panel de Supabase.
 * Al revés, Supabase rechaza todo acceso sin token y nadie puede entrar.
 *
 * Sin la variable (desarrollo local, CI) no se pinta el widget y las llamadas
 * salen sin token, exactamente como antes.
 */

export const TURNSTILE_SITE_KEY: string = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

export const captchaActivo = (): boolean => TURNSTILE_SITE_KEY.length > 0;

/**
 * Lo que se añade a `options` de cada llamada de Supabase Auth.
 * Sin token no se añade nada: mandar `captchaToken: ''` o `undefined` no
 * aporta y ensucia la petición.
 */
export const opcionesCaptcha = (token: string | null | undefined): { captchaToken?: string } =>
    token ? { captchaToken: token } : {};

/**
 * ¿Puede enviarse el formulario? Con CAPTCHA activo, solo con token.
 * Sin CAPTCHA configurado, siempre.
 */
export const puedeEnviarConCaptcha = (token: string | null | undefined): boolean =>
    !captchaActivo() || Boolean(token);

export const MENSAJE_CAPTCHA_FALLIDO =
    'No se pudo comprobar que eres una persona. Recarga la página e inténtalo de nuevo.';

/** Supabase devuelve `captcha_failed` cuando el token falta, caduca o ya se usó. */
export const esErrorDeCaptcha = (error: any): boolean => {
    const codigo = error?.code ?? '';
    const mensaje = String(error?.message ?? '').toLowerCase();
    return codigo === 'captcha_failed' || mensaje.includes('captcha');
};
