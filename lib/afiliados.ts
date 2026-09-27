/**
 * Programa de afiliados — parte del navegador.
 *
 * Quien registra las comisiones es el servidor (stripe-webhook, evento
 * invoice.paid, con registrar_comision_afiliado()). Aquí solo hay:
 *  - recordar el código del enlace ?ref= hasta que la cuenta exista;
 *  - vincularlo después si el alta fue con Google (que no admite metadatos);
 *  - leer los referidos propios y calcular los totales de la página.
 */
import { supabase } from '@/lib/supabaseClient';
import type { Referral } from '@/types';

const CLAVE = 'devfreelancer_ref';
const CODIGO_VALIDO = /^[a-z0-9]{4,32}$/;

/** Normaliza un código de afiliado; null si no tiene pinta de serlo. */
export const normalizarCodigo = (codigo: string | null | undefined): string | null => {
    const c = (codigo ?? '').trim().toLowerCase();
    return CODIGO_VALIDO.test(c) ? c : null;
};

/** Código ?ref= de una query string ("?ref=abc123&x=1"). */
export const codigoDeLaUrl = (search: string): string | null =>
    normalizarCodigo(new URLSearchParams(search).get('ref'));

// localStorage puede no existir o lanzar (modo privado, cookies bloqueadas):
// el programa de afiliados nunca debe romper el registro.
export const guardarCodigoPendiente = (codigo: string): void => {
    try { localStorage.setItem(CLAVE, codigo); } catch { /* sin almacenamiento */ }
};
export const leerCodigoPendiente = (): string | null => {
    try { return normalizarCodigo(localStorage.getItem(CLAVE)); } catch { return null; }
};
export const borrarCodigoPendiente = (): void => {
    try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
};

/**
 * Si quedó un código pendiente (alta con Google, o alta con correo que
 * confirmó en otra pestaña), lo vincula a la cuenta con sesión. El servidor
 * solo lo acepta en los 7 días siguientes al alta y si aún no hay afiliado;
 * con cualquier respuesta se olvida el código. Solo se conserva si falla la
 * llamada, para reintentarlo en el siguiente inicio de sesión.
 */
export const vincularReferidoPendiente = async (): Promise<void> => {
    const codigo = leerCodigoPendiente();
    if (!codigo) return;
    const { error } = await supabase.rpc('vincular_referido', { p_codigo: codigo });
    if (!error) borrarCodigoPendiente();
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
