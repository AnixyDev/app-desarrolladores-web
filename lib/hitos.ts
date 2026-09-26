/**
 * Hitos de proyecto: solo seguimiento (nombre, fecha, estado).
 * La tabla y sus permisos: migración hitos_de_proyecto.
 */

export type EstadoHito = 'pendiente' | 'en_curso' | 'entregado';

export interface Hito {
    id: string;
    project_id: string;
    title: string;
    due_date: string | null;
    status: EstadoHito;
    position: number;
}

export const ESTADOS_HITO: { valor: EstadoHito; texto: string }[] = [
    { valor: 'pendiente', texto: 'Pendiente' },
    { valor: 'en_curso', texto: 'En curso' },
    { valor: 'entregado', texto: 'Entregado' },
];

export const textoDeEstado = (e: EstadoHito): string =>
    ESTADOS_HITO.find(x => x.valor === e)?.texto ?? e;

/** Por fecha (los sin fecha al final), y a igual fecha por posición y nombre. */
export const ordenarHitos = (hitos: Hito[]): Hito[] =>
    [...hitos].sort((a, b) => {
        if (a.due_date !== b.due_date) {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date < b.due_date ? -1 : 1;
        }
        if (a.position !== b.position) return a.position - b.position;
        return a.title.localeCompare(b.title, 'es');
    });

export const resumenDeHitos = (hitos: Hito[]): string => {
    if (hitos.length === 0) return 'Sin hitos';
    const entregados = hitos.filter(h => h.status === 'entregado').length;
    return `${entregados} de ${hitos.length} entregados`;
};

/**
 * ¿Va con retraso? Se compara la fecha (AAAA-MM-DD) con la de hoy como texto,
 * no con new Date(): así no depende del huso horario (mismo fallo que tuvo el
 * aviso de caducidad del certificado).
 */
export const hitoAtrasado = (h: Hito, hoy: string = new Date().toLocaleDateString('sv-SE')): boolean =>
    h.status !== 'entregado' && !!h.due_date && h.due_date < hoy;

/** DD/MM/AAAA a partir de AAAA-MM-DD, sin pasar por Date. */
export const fechaCorta = (iso: string | null): string => {
    if (!iso) return 'Sin fecha';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};
