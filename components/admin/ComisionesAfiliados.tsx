import React, { useCallback, useEffect, useState } from 'react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import { Users as UsersIcon, CheckCircleIcon, AlertTriangleIcon } from '@/components/icons/Icon';
import {
    cargarResumenAfiliados,
    cargarComisionesPendientes,
    marcarComisionesPagadas,
    mensajeDeErrorDePago,
    totalesDelResumen,
    type ResumenAfiliado,
    type ComisionPendiente,
} from '@/lib/adminAfiliados';

const fecha = (iso: string | null) => formatearFecha(iso);

/**
 * Comisiones de afiliados pendientes de pagar, y el botón para marcarlas como
 * pagadas cuando ya has hecho la transferencia o el Bizum. La app no mueve
 * dinero: solo lleva la cuenta.
 */
const ComisionesAfiliados: React.FC = () => {
    const { addToast } = useToast();
    const [filas, setFilas] = useState<ResumenAfiliado[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [abierto, setAbierto] = useState<ResumenAfiliado | null>(null);
    const [detalle, setDetalle] = useState<ComisionPendiente[]>([]);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    const recargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            setFilas(await cargarResumenAfiliados());
        } catch (e: any) {
            setError(mensajeDeErrorDePago(e));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { recargar(); }, [recargar]);

    const abrirPago = async (fila: ResumenAfiliado) => {
        setAbierto(fila);
        setNota('');
        setDetalle([]);
        setCargandoDetalle(true);
        try {
            setDetalle(await cargarComisionesPendientes(fila.referrer_id));
        } catch (e: any) {
            addToast(mensajeDeErrorDePago(e), 'error');
        } finally {
            setCargandoDetalle(false);
        }
    };

    const confirmarPago = async () => {
        if (!abierto) return;
        setGuardando(true);
        const { error: err } = await marcarComisionesPagadas(abierto.referrer_id, abierto.pendiente_cents, nota);
        setGuardando(false);
        if (err) {
            addToast(mensajeDeErrorDePago(err), 'error');
            if (err.code === '40001' || err.code === 'P0002') {
                setAbierto(null);
                recargar();
            }
            return;
        }
        addToast(`Pago de ${formatCurrency(abierto.pendiente_cents)} a ${abierto.nombre} registrado.`, 'success');
        setAbierto(null);
        recargar();
    };

    const totales = totalesDelResumen(filas);

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-gray-800">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <UsersIcon className="w-5 h-5 text-primary-400" /> Comisiones de afiliados
                </h2>
                {!cargando && !error && (
                    <p className="text-sm text-gray-400">
                        Pendiente de pagar: <span className="font-bold text-white">{formatCurrency(totales.pendiente)}</span>
                        <span className="mx-2 text-gray-600">·</span>
                        Pagado: <span className="font-bold text-gray-200">{formatCurrency(totales.pagado)}</span>
                    </p>
                )}
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                {cargando ? (
                    <div className="p-4 space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} variant="text" className="w-full h-8" />)}
                    </div>
                ) : error ? (
                    <div className="p-10 text-center">
                        <AlertTriangleIcon className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        <p className="text-gray-300 mb-4">{error}</p>
                        <Button variant="secondary" onClick={recargar}>Reintentar</Button>
                    </div>
                ) : filas.length === 0 ? (
                    <p className="p-12 text-center text-gray-500 text-sm">
                        Todavía nadie se ha registrado con un enlace de afiliado.
                    </p>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-gray-950/50 text-xs uppercase font-black text-gray-500 tracking-widest">
                            <tr>
                                <th className="p-4">Afiliado</th>
                                <th className="p-4">Referidos</th>
                                <th className="p-4">Pendiente</th>
                                <th className="p-4">Pagado</th>
                                <th className="p-4">Último pago</th>
                                <th className="p-4 text-right"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {filas.map(f => (
                                <tr key={f.referrer_id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="p-4">
                                        <p className="text-sm font-medium text-white">{f.nombre}</p>
                                        <p className="text-xs text-gray-500">{f.email}</p>
                                    </td>
                                    <td className="p-4 text-sm text-gray-300">
                                        {f.referidos} <span className="text-gray-500">({f.suscritos} suscritos)</span>
                                    </td>
                                    <td className={`p-4 text-sm font-black ${f.pendiente_cents > 0 ? 'text-amber-300' : 'text-gray-500'}`}>
                                        {formatCurrency(f.pendiente_cents)}
                                    </td>
                                    <td className="p-4 text-sm text-gray-300">{formatCurrency(f.pagado_cents)}</td>
                                    <td className="p-4 text-xs text-gray-500">{fecha(f.ultimo_pago)}</td>
                                    <td className="p-4 text-right">
                                        {f.pendiente_cents > 0 ? (
                                            <Button size="sm" onClick={() => abrirPago(f)}>Marcar como pagado</Button>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs text-green-400">
                                                <CheckCircleIcon className="w-4 h-4" /> Al día
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </CardContent>

            <Modal isOpen={!!abierto} onClose={() => !guardando && setAbierto(null)} title="Registrar pago de comisiones">
                {abierto && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-300">
                            Vas a marcar como pagadas <strong>todas</strong> las comisiones pendientes de{' '}
                            <strong className="text-white">{abierto.nombre}</strong>. Hazlo cuando ya le hayas
                            enviado el dinero: la app no hace el pago, solo lo apunta.
                        </p>

                        <div className="rounded-lg border border-gray-800 bg-gray-950/50 max-h-56 overflow-y-auto">
                            {cargandoDetalle ? (
                                <div className="p-3"><Skeleton variant="text" className="w-full h-6" /></div>
                            ) : (
                                <ul className="divide-y divide-gray-800 text-sm">
                                    {detalle.map(c => (
                                        <li key={c.id} className="flex justify-between gap-3 px-3 py-2">
                                            <span className="text-gray-400">
                                                {fecha(c.created_at)} · {c.invitado || 'Invitado'}
                                                <span className="text-gray-600"> · 20% de {formatCurrency(c.base_cents)}</span>
                                            </span>
                                            <span className="text-white font-medium shrink-0">{formatCurrency(c.comision_cents)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="flex justify-between items-baseline">
                            <span className="text-gray-400 text-sm">Total a pagar</span>
                            <span className="text-2xl font-black text-white">{formatCurrency(abierto.pendiente_cents)}</span>
                        </div>

                        <div>
                            <label htmlFor="nota-pago" className="block text-sm text-gray-400 mb-1">
                                Nota (opcional)
                            </label>
                            <input
                                id="nota-pago"
                                value={nota}
                                maxLength={200}
                                onChange={e => setNota(e.target.value)}
                                placeholder="Ej.: Bizum 27/09, transferencia ES12…"
                                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="secondary" onClick={() => setAbierto(null)} disabled={guardando}>Cancelar</Button>
                            <Button onClick={confirmarPago} disabled={guardando || cargandoDetalle}>
                                {guardando ? 'Guardando…' : `Confirmar pago de ${formatCurrency(abierto.pendiente_cents)}`}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </Card>
    );
};

export default ComisionesAfiliados;
