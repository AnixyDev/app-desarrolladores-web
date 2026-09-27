/**
 * Panel de administración — comisiones de afiliados.
 *
 * Toda la lógica y la comprobación de permisos vive en la base de datos
 * (funciones admin_* de la migración pagos_de_comisiones): aquí solo se
 * llaman y se traducen los errores a algo que se entienda.
 */
import { supabase } from '@/lib/supabaseClient';

export interface ResumenAfiliado {
    referrer_id: string;
    nombre: string;
    email: string;
    referidos: number;
    suscritos: number;
    pendiente_cents: number;
    pagado_cents: number;
    ultima_comision: string | null;
    ultimo_pago: string | null;
}

export interface ComisionPendiente {
    id: string;
    created_at: string;
    invitado: string | null;
    base_cents: number;
    comision_cents: number;
    stripe_invoice_id: string;
}

interface ErrorDeBase { code?: string; message?: string }

/** Mensaje para la persona que administra, según lo que respondió la base de datos. */
export const mensajeDeErrorDePago = (error: ErrorDeBase | null | undefined): string => {
    switch (error?.code) {
        case '40001':
            return 'Ha entrado una comisión nueva desde que abriste el panel. Lo he recargado: revisa el importe y vuelve a confirmar.';
        case 'P0002':
            return 'Este afiliado ya no tiene comisiones pendientes (¿se marcó en otra pestaña?).';
        case '42501':
            return 'Solo una cuenta con rol Admin puede hacer esto.';
        default:
            return error?.message || 'No se pudo completar la operación.';
    }
};

// PostgREST devuelve bigint como número o como texto según el tamaño: se
// normaliza a número (los importes en céntimos caben de sobra).
const numero = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export const cargarResumenAfiliados = async (): Promise<ResumenAfiliado[]> => {
    const { data, error } = await supabase.rpc('admin_resumen_afiliados');
    if (error) throw error;
    return ((data ?? []) as any[]).map(f => ({
        ...f,
        referidos: numero(f.referidos),
        suscritos: numero(f.suscritos),
        pendiente_cents: numero(f.pendiente_cents),
        pagado_cents: numero(f.pagado_cents),
    }));
};

export const cargarComisionesPendientes = async (referrerId: string): Promise<ComisionPendiente[]> => {
    const { data, error } = await supabase.rpc('admin_comisiones_pendientes', { p_referrer: referrerId });
    if (error) throw error;
    return (data ?? []) as ComisionPendiente[];
};

/**
 * Marca como pagadas todas las comisiones pendientes del afiliado. Se manda el
 * importe que la persona vio al confirmar: si no cuadra, la base de datos no
 * marca nada (error 40001).
 */
export const marcarComisionesPagadas = async (referrerId: string, importeVisto: number, nota: string) => {
    const { data, error } = await supabase.rpc('admin_marcar_comisiones_pagadas', {
        p_referrer: referrerId,
        p_importe_esperado: importeVisto,
        p_nota: nota.trim() || null,
    });
    return { pago: data, error: error as ErrorDeBase | null };
};

export const totalesDelResumen = (filas: ResumenAfiliado[]) => ({
    pendiente: filas.reduce((s, f) => s + f.pendiente_cents, 0),
    pagado: filas.reduce((s, f) => s + f.pagado_cents, 0),
    afiliadosConPendiente: filas.filter(f => f.pendiente_cents > 0).length,
});
