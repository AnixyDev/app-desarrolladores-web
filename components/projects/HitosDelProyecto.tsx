import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CheckCircleIcon, TrashIcon, PlusIcon } from '@/components/icons/Icon';
import {
    type Hito, type EstadoHito, ESTADOS_HITO, textoDeEstado,
    ordenarHitos, resumenDeHitos, hitoAtrasado, fechaCorta,
} from '@/lib/hitos';

interface Props {
    projectId: string;
    /** Dueño del proyecto, o Manager/Admin de su equipo. */
    puedeEditar: boolean;
}

const COLOR_ESTADO: Record<EstadoHito, string> = {
    pendiente: 'bg-gray-700 text-gray-300',
    en_curso: 'bg-blue-500/15 text-blue-300',
    entregado: 'bg-green-500/15 text-green-300',
};

/**
 * Hitos del proyecto. Lo usan el detalle del proyecto (editable según el rol)
 * y el portal del cliente (solo lectura). Quién ve y quién edita lo decide la
 * base de datos; puedeEditar solo esconde lo que se rechazaría.
 */
const HitosDelProyecto: React.FC<Props> = ({ projectId, puedeEditar }) => {
    const [hitos, setHitos] = useState<Hito[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [titulo, setTitulo] = useState('');
    const [fecha, setFecha] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        const { data, error: e } = await supabase
            .from('project_milestones')
            .select('id, project_id, title, due_date, status, position')
            .eq('project_id', projectId);
        if (e) setError('No se pudieron cargar los hitos.');
        else setHitos(ordenarHitos((data ?? []) as Hito[]));
        setCargando(false);
    }, [projectId]);

    useEffect(() => { cargar(); }, [cargar]);

    const crear = async (e: React.FormEvent) => {
        e.preventDefault();
        const t = titulo.trim();
        if (!t) return;
        setGuardando(true);
        setError(null);
        const { data, error: err } = await supabase
            .from('project_milestones')
            // user_id no se manda: la base de datos pone siempre el del dueño del proyecto.
            .insert({ project_id: projectId, title: t, due_date: fecha || null, position: hitos.length })
            .select('id, project_id, title, due_date, status, position')
            .single();
        setGuardando(false);
        if (err || !data) {
            setError('No se pudo crear el hito.');
            return;
        }
        setHitos(prev => ordenarHitos([...prev, data as Hito]));
        setTitulo('');
        setFecha('');
    };

    const cambiarEstado = async (id: string, status: EstadoHito) => {
        const antes = hitos;
        setHitos(prev => prev.map(h => (h.id === id ? { ...h, status } : h)));
        const { error: err } = await supabase.from('project_milestones').update({ status }).eq('id', id);
        if (err) {
            setHitos(antes);
            setError('No se pudo cambiar el estado.');
        }
    };

    const borrar = async (id: string) => {
        const antes = hitos;
        setHitos(prev => prev.filter(h => h.id !== id));
        const { error: err } = await supabase.from('project_milestones').delete().eq('id', id);
        if (err) {
            setHitos(antes);
            setError('No se pudo borrar el hito.');
        }
    };

    return (
        <div className="space-y-3">
            <p className="text-xs text-gray-400">{cargando ? 'Cargando…' : resumenDeHitos(hitos)}</p>

            {!cargando && hitos.length === 0 && (
                <p className="text-sm text-gray-500">
                    {puedeEditar ? 'Añade los hitos del proyecto para seguir su avance.' : 'Todavía no hay hitos en este proyecto.'}
                </p>
            )}

            <ul className="space-y-2">
                {hitos.map(h => (
                    <li key={h.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                        <CheckCircleIcon className={`h-5 w-5 shrink-0 ${h.status === 'entregado' ? 'text-green-400' : 'text-gray-600'}`} />
                        <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm ${h.status === 'entregado' ? 'text-gray-400 line-through' : 'text-white'}`}>{h.title}</p>
                            <p className={`text-xs ${hitoAtrasado(h) ? 'text-red-400' : 'text-gray-500'}`}>
                                {fechaCorta(h.due_date)}{hitoAtrasado(h) ? ' · con retraso' : ''}
                            </p>
                        </div>
                        {puedeEditar ? (
                            <>
                                <select
                                    value={h.status}
                                    onChange={e => cambiarEstado(h.id, e.target.value as EstadoHito)}
                                    aria-label={`Estado de ${h.title}`}
                                    className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white"
                                >
                                    {ESTADOS_HITO.map(s => <option key={s.valor} value={s.valor}>{s.texto}</option>)}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => borrar(h.id)}
                                    aria-label={`Borrar el hito ${h.title}`}
                                    className="text-gray-500 hover:text-red-400"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <span className={`rounded-full px-2 py-0.5 text-xs ${COLOR_ESTADO[h.status]}`}>{textoDeEstado(h.status)}</span>
                        )}
                    </li>
                ))}
            </ul>

            {puedeEditar && (
                <form onSubmit={crear} className="flex flex-col gap-2 sm:flex-row">
                    <input
                        value={titulo}
                        onChange={e => setTitulo(e.target.value)}
                        maxLength={200}
                        placeholder="Nuevo hito (p. ej. Diseño aprobado)"
                        aria-label="Nombre del hito"
                        className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
                    />
                    <input
                        type="date"
                        value={fecha}
                        onChange={e => setFecha(e.target.value)}
                        aria-label="Fecha del hito"
                        className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
                    />
                    <button
                        type="submit"
                        disabled={guardando || !titulo.trim()}
                        className="flex items-center justify-center gap-1 rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                        <PlusIcon className="h-4 w-4" /> Añadir
                    </button>
                </form>
            )}

            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </div>
    );
};

export default HitosDelProyecto;
