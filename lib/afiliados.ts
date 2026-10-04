/**
 * Programa de afiliados — parte del navegador.
 *
 * Quien registra las comisiones es el servidor (stripe-webhook, evento
 * invoice.paid, con registrar_comision_afiliado()). Aquí solo hay:
 *  - llevar el código del enlace ?ref= hasta el alta (sin guardarlo);
 *  - vincularlo después si el alta fue con Google (que no admite metadatos);
 *  - leer los referidos propios y calcular los totales de la página.
 */
import { supabase } from '@/lib/supabaseClient';
import type { Referral } from '@/types';

const CODIGO_VALIDO = /^[a-z0-9]{4,32}$/;

/** Normaliza un código de afiliado; null si no tiene pinta de serlo. */
export const normalizarCodigo = (codigo: string | null | undefined): string | null => {
    const c = (codigo ?? '').trim().toLowerCase();
    return CODIGO_VALIDO.test(c) ? c : null;
};

/** Código ?ref= de una query string ("?ref=abc123&x=1"). */
export const codigoDeLaUrl = (search: string): string | null =>
    normalizarCodigo(new URLSearchParams(search).get('ref'));

/**
 * Sin almacenamiento en el navegador (04/10/2026): el código viaja siempre en
 * la URL, así no hace falta pedir consentimiento de cookies.
 *  - Alta con correo: va en los metadatos de signUp() y lo vincula
 *    handle_new_user() en la base de datos.
 *  - Alta con Google: Google no admite metadatos, así que el código va en la
 *    URL de vuelta (redirectTo) y, ya con sesión, VincularReferidoDeLaUrl
 *    llama a vincular_referido().
 */

/** URL de vuelta tras el alta con Google, con el código de afiliado si lo hay. */
export const urlDeVueltaConReferido = (origen: string, codigo: string | null): string =>
    codigo ? `${origen}/?ref=${encodeURIComponent(codigo)}` : origen;

/**
 * Vincula el código a la cuenta con sesión. El servidor solo lo acepta en los
 * 7 días siguientes al alta y si aún no hay afiliado. Devuelve false solo si
 * la llamada falla (para dejar el código en la URL y reintentar al recargar).
 */
export const vincularReferido = async (codigo: string): Promise<boolean> => {
    const { error } = await supabase.rpc('vincular_referido', { p_codigo: codigo });
    return !error;
};

/** Claves que guardaban versiones anteriores y ya no se usan: se borran. */
export const CLAVES_ANTIGUAS = ['devfreelancer_ref', 'df_cookie_consent', 'df_cookie_prefs'] as const;
export const borrarClavesAntiguas = (): void => {
    try { for (const c of CLAVES_ANTIGUAS) localStorage.removeItem(c); } catch { /* sin almacenamiento */ }
};

export const cargarReferidos = async (): Promise<Referral[]> => {
    const { data, error } = await supabase
        .from('referrals')
        .select('id, referred_user_name, join_date, created_at, status, commission_cents')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Referral[];
};

export const estadisticasDeReferidos = (referidos: Referral[]) => ({
    totalReferrals: referidos.length,
    activeSubscriptions: referidos.filter(r => r.status === 'Subscribed').length,
    totalEarnings: referidos.reduce((suma, r) => suma + (r.commission_cents ?? 0), 0),
});

/** Lo ganado, separado en pendiente de cobro y ya cobrado (pagos marcados por la administración). */
export const repartoDeCobro = (comisiones: { comision_cents: number; pago_id: string | null }[]) => ({
    pendiente: comisiones.filter(c => !c.pago_id).reduce((s, c) => s + (c.comision_cents ?? 0), 0),
    cobrado: comisiones.filter(c => !!c.pago_id).reduce((s, c) => s + (c.comision_cents ?? 0), 0),
});

export const cargarReparto = async () => {
    const { data, error } = await supabase.from('comisiones_afiliado').select('comision_cents, pago_id');
    if (error) throw error;
    return repartoDeCobro((data ?? []) as { comision_cents: number; pago_id: string | null }[]);
};
