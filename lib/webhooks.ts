/**
 * Webhooks de las integraciones (plan Teams).
 *
 * Quien envía los webhooks es la base de datos (pg_net, ver la migración
 * webhooks_de_integraciones), no el navegador. Aquí solo hay:
 *  - la misma regla de direcciones que aplica el servidor, para avisar en el
 *    formulario antes de intentar guardar (el servidor la vuelve a comprobar:
 *    esto es comodidad, no seguridad);
 *  - la espera del resultado del botón "Probar".
 */

const SUFIJOS_INTERNOS = /\.(localhost|local|internal|intranet|lan|home|corp|localdomain)$/;
const HOST_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Mismo criterio que public.url_de_webhook_valida(). */
export const urlDeWebhookValida = (url: string): boolean => {
    if (!url || url.length > 2048 || !/^https:\/\//i.test(url)) return false;
    const m = /^https:\/\/([^/?#]+)/i.exec(url);
    if (!m) return false;
    let host = m[1].toLowerCase();
    if (host.includes('@')) return false;
    host = host.replace(/:\d+$/, '');
    if (host.startsWith('[')) return false;          // IPv6
    if (/^[0-9.]+$/.test(host)) return false;        // IPv4
    if (!HOST_VALIDO.test(host)) return false;
    if (host === 'localhost' || SUFIJOS_INTERNOS.test(host)) return false;
    return true;
};

export const MENSAJE_URL_NO_VALIDA =
    'La dirección tiene que empezar por https:// y ser de un dominio público (no se admiten IPs ni direcciones internas).';

export interface ResultadoPrueba {
    /** null: el destino no ha contestado a tiempo. */
    status: number | null;
    error: string | null;
}

/**
 * pg_net envía en segundo plano: el id de la petición llega al instante y la
 * respuesta unos cientos de milisegundos después. Se pregunta varias veces.
 */
export const esperarResultadoPrueba = async (
    consultar: () => Promise<{ status_code: number | null; error: string | null } | null>,
    { intentos = 10, esperaMs = 700 }: { intentos?: number; esperaMs?: number } = {}
): Promise<ResultadoPrueba> => {
    for (let i = 0; i < intentos; i++) {
        await new Promise(r => setTimeout(r, esperaMs));
        const fila = await consultar();
        if (fila && (fila.status_code !== null || fila.error)) {
            return { status: fila.status_code ?? null, error: fila.error ?? null };
        }
    }
    return { status: null, error: null };
};

export const pruebaCorrecta = (r: ResultadoPrueba): boolean =>
    r.status !== null && r.status >= 200 && r.status < 300;
