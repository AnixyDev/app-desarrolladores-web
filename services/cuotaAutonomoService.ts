// Cuota de autónomo: lectura y escritura del histórico (tabla cuotas_autonomo,
// con RLS de propietario) y registro de los meses ya cargados.
import { supabase } from '@/lib/supabaseClient';
import type { CuotaAutonomo } from '@/types';

export async function cargarCuotasAutonomo(): Promise<CuotaAutonomo[]> {
  const { data, error } = await supabase.from('cuotas_autonomo').select('*').order('desde', { ascending: false });
  if (error) throw new Error('No se pudo cargar tu cuota de autónomo.');
  return (data ?? []) as CuotaAutonomo[];
}

/** Guarda un tramo («desde este mes pago X»). Si ya había uno ese mes, lo sustituye. */
export async function guardarCuotaAutonomo(desde: string, importeCents: number, nota: string | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Tu sesión ha caducado. Vuelve a entrar.');
  const { error } = await supabase
    .from('cuotas_autonomo')
    .upsert({ user_id: user.id, desde: `${desde.slice(0, 7)}-01`, importe_cents: importeCents, nota: nota?.trim() || null }, { onConflict: 'user_id,desde' });
  if (error) throw new Error('No se pudo guardar la cuota. Revisa el importe y la fecha.');
}

export async function borrarCuotaAutonomo(id: string): Promise<void> {
  const { error } = await supabase.from('cuotas_autonomo').delete().eq('id', id);
  if (error) throw new Error('No se pudo borrar ese tramo de la cuota.');
}

/** Apunta como gasto los meses ya cargados que falten. Devuelve cuántos apuntó. */
export async function registrarMisCuotas(): Promise<number> {
  const { data, error } = await supabase.rpc('registrar_mis_cuotas_autonomo');
  if (error) { console.error('registrar_mis_cuotas_autonomo:', error.message); return 0; }
  return Number(data) || 0;
}
