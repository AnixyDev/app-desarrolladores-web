// Cuota de autónomo en la pantalla de gastos (29/09/2026, a petición de Ana).
// Guarda el histórico de importes y la app apunta cada mes el gasto cuando
// llega el cargo; así entra en informes, rentabilidad y previsión.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EditIcon, TrashIcon, ShieldCheckIcon } from '@/components/icons/Icon';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import type { CuotaAutonomo } from '@/types';
import { importeDelMes, proximoCargo, pagadoEnElAnio, primeroDeMes } from '@/lib/cuotaAutonomo';
import { cargarCuotasAutonomo, guardarCuotaAutonomo, borrarCuotaAutonomo, registrarMisCuotas } from '@/services/cuotaAutonomoService';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (desde: string) => `${MESES[Number(desde.slice(5, 7)) - 1]} ${desde.slice(0, 4)}`;

const hoyLocal = () => new Date().toLocaleDateString('sv-SE');
const mesSiguiente = (hoy: string) => {
  const [a, m] = hoy.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return d.toISOString().slice(0, 7);
};

const CuotaAutonomoCard: React.FC = () => {
  const { expenses, recargarGastos } = useAppStore(useShallow(s => ({ expenses: s.expenses, recargarGastos: s.recargarGastos })));
  const { addToast } = useToast();
  const [tramos, setTramos] = useState<CuotaAutonomo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [importe, setImporte] = useState('');
  const [desde, setDesde] = useState('');
  const [nota, setNota] = useState('');

  const hoy = hoyLocal();

  const sincronizar = useCallback(async () => {
    try {
      const lista = await cargarCuotasAutonomo();
      setTramos(lista);
      if (lista.length) {
        const nuevos = await registrarMisCuotas();
        if (nuevos > 0) await recargarGastos();
      }
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setCargando(false);
    }
  }, [addToast, recargarGastos]);

  useEffect(() => { sincronizar(); }, [sincronizar]);

  const actual = importeDelMes(tramos, primeroDeMes(hoy));
  const proximo = useMemo(() => proximoCargo(tramos, hoy), [tramos, hoy]);
  const pagadoAnio = useMemo(() => pagadoEnElAnio(expenses ?? [], hoy.slice(0, 4)), [expenses, hoy]);
  const mesesPagados = useMemo(() => (expenses ?? []).filter(g => g.cuota_autonomo_mes && g.date.startsWith(hoy.slice(0, 4))).length, [expenses, hoy]);

  const abrirFormulario = () => {
    setImporte(actual ? String(actual / 100).replace('.', ',') : '');
    setDesde(tramos.length ? mesSiguiente(hoy) : hoy.slice(0, 7));
    setNota('');
    setEditando(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const euros = Number(importe.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(euros) || euros < 0 || euros > 5000) { addToast('Indica un importe mensual válido (0 para darte de baja).', 'error'); return; }
    if (!/^\d{4}-\d{2}$/.test(desde)) { addToast('Indica desde qué mes pagas esa cuota.', 'error'); return; }
    setGuardando(true);
    try {
      await guardarCuotaAutonomo(desde, Math.round(euros * 100), nota);
      setEditando(false);
      await sincronizar();
      addToast(euros === 0 ? 'Baja anotada: desde ese mes no se apunta la cuota.' : 'Cuota de autónomo guardada.', 'success');
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const borrarTramo = async (t: CuotaAutonomo) => {
    if (!window.confirm(`¿Borrar el tramo que empieza en ${nombreMes(t.desde)}? Los gastos de meses ya apuntados no se tocan.`)) return;
    try {
      await borrarCuotaAutonomo(t.id);
      await sincronizar();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary-600/20 text-primary-400"><ShieldCheckIcon className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-white">Cuota de autónomo</h2>
              <p className="text-xs text-gray-400">Seguridad Social (RETA). Se apunta sola como gasto cada mes, sin IVA.</p>
            </div>
          </div>
          {!editando && !cargando && (
            <Button size="sm" variant={tramos.length ? 'secondary' : 'primary'} onClick={abrirFormulario}>
              <EditIcon className="w-4 h-4 mr-2" />{tramos.length ? 'Cambiar cuota' : 'Configurar mi cuota'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargando ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : (
          <>
            {tramos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-gray-800/60 p-3">
                  <p className="text-xs text-gray-400">Cuota este mes</p>
                  <p className="text-xl font-bold text-white">{actual ? `${formatCurrency(actual)}` : 'Sin cuota'}</p>
                </div>
                <div className="rounded-lg bg-gray-800/60 p-3">
                  <p className="text-xs text-gray-400">Próximo cargo</p>
                  <p className="text-xl font-bold text-white">{proximo ? formatCurrency(proximo.importe_cents) : '—'}</p>
                  {proximo && <p className="text-xs text-gray-500">{formatearFecha(proximo.fecha)}</p>}
                </div>
                <div className="rounded-lg bg-gray-800/60 p-3">
                  <p className="text-xs text-gray-400">Pagado en {hoy.slice(0, 4)}</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(pagadoAnio)}</p>
                  <p className="text-xs text-gray-500">{mesesPagados} {mesesPagados === 1 ? 'mes apuntado' : 'meses apuntados'}</p>
                </div>
              </div>
            )}

            {!tramos.length && !editando && (
              <p className="text-sm text-gray-300">
                Indica cuánto pagas al mes y desde cuándo. La app apuntará la cuota como gasto el último día hábil de cada mes
                (cuando la carga la Seguridad Social), y la tendrán en cuenta los informes, la rentabilidad y la previsión.
              </p>
            )}

            {editando && (
              <form onSubmit={guardar} className="rounded-lg border border-gray-700 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="block text-sm text-gray-300 mb-1">Cuota mensual (€)</span>
                    <input inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} placeholder="Ej. 80 o 294,00" required
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </label>
                  <label className="block">
                    <span className="block text-sm text-gray-300 mb-1">Desde el mes</span>
                    <input type="month" value={desde} onChange={e => setDesde(e.target.value)} required
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </label>
                  <label className="block">
                    <span className="block text-sm text-gray-300 mb-1">Nota (opcional)</span>
                    <input value={nota} onChange={e => setNota(e.target.value)} maxLength={200} placeholder="Ej. Tarifa plana, tramo 3…"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  Si tu cuota cambia (fin de la tarifa plana, nuevo tramo), añade un tramo nuevo desde el mes del cambio: los meses
                  anteriores se quedan como estaban. Pon 0 para darte de baja. Si eliges un mes pasado, se apuntarán los meses que falten.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditando(false)}>Cancelar</Button>
                  <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
                </div>
              </form>
            )}

            {tramos.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Histórico</p>
                <ul className="divide-y divide-gray-800">
                  {tramos.map(t => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="text-gray-200">Desde {nombreMes(t.desde)}</span>
                        <span className="text-gray-400"> · {t.importe_cents ? `${formatCurrency(t.importe_cents)}/mes` : 'baja'}</span>
                        {t.nota && <span className="text-gray-500"> · {t.nota}</span>}
                      </div>
                      <Button size="sm" variant="danger" onClick={() => borrarTramo(t)} title="Borrar este tramo">
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500 mt-2">
                  Si algún mes no la pagaste (bonificación, devolución…), borra ese gasto en la lista de abajo: no volverá a aparecer.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CuotaAutonomoCard;
