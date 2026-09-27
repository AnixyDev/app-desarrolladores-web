/**
 * Cifras del panel de administración. Los datos vienen de admin_metricas()
 * (solo Admin); aquí solo está la cuenta del beneficio estimado, para poder
 * probarla.
 */
import { supabase } from '@/lib/supabaseClient';

export interface MetricasAdmin {
    usuarios_total: number;
    usuarios_nuevos_30d: number;
    suscriptores_pro: number;
    suscriptores_teams: number;
    ingresos_total_cents: number;
    ingresos_30d_cents: number;
    cobros_total: number;
    cobros_30d: number;
}

// Comisión de Stripe para tarjetas europeas (1,5 % + 0,25 €) y el coste fijo
// mensual de infraestructura que ya usaba el panel.
export const STRIPE_FIJO_CENTS = 25;
export const STRIPE_PORCENTAJE = 0.015;
export const INFRA_MENSUAL_CENTS = 82;

/** Beneficio de los últimos 30 días, restando comisiones de Stripe e infraestructura. */
export const beneficioNeto30d = (m: Pick<MetricasAdmin, 'ingresos_30d_cents' | 'cobros_30d'>): number =>
    Math.round(m.ingresos_30d_cents - (m.cobros_30d * STRIPE_FIJO_CENTS + m.ingresos_30d_cents * STRIPE_PORCENTAJE) - INFRA_MENSUAL_CENTS);

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export const cargarMetricas = async (): Promise<MetricasAdmin> => {
    const { data, error } = await supabase.rpc('admin_metricas');
    if (error) throw error;
    const f = (Array.isArray(data) ? data[0] : data) ?? {};
    return {
        usuarios_total: num(f.usuarios_total),
        usuarios_nuevos_30d: num(f.usuarios_nuevos_30d),
        suscriptores_pro: num(f.suscriptores_pro),
        suscriptores_teams: num(f.suscriptores_teams),
        ingresos_total_cents: num(f.ingresos_total_cents),
        ingresos_30d_cents: num(f.ingresos_30d_cents),
        cobros_total: num(f.cobros_total),
        cobros_30d: num(f.cobros_30d),
    };
};
