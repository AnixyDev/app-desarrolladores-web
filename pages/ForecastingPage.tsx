// pages/ForecastingPage.tsx
//
// Previsión de tesorería (29/09/2026). Hasta hoy esta ruta mostraba una copia
// antigua de la página de facturas. El cálculo vive en lib/prevision.ts, que
// tiene sus propias pruebas; aquí solo se reúnen los datos y se pintan.
import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts';

import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabaseClient';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import { calcularPrevision, type TipoMovimiento } from '@/lib/prevision';
import { generateFinancialForecast, AI_CREDIT_COSTS } from '@/services/geminiService';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  AlertTriangleIcon, ArrowDownCircleIcon, ArrowUpCircleIcon, TrendingUpIcon, SparklesIcon, RefreshCwIcon, DollarSignIcon,
} from '@/components/icons/Icon';

const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));

// Validado con el validador de paletas (modo oscuro): rosa de marca y azul.
const COLOR_COBROS = '#f000b8';
const COLOR_PAGOS = '#0284c7';

const NOMBRE_TIPO: Record<TipoMovimiento, string> = {
  factura: 'Facturas pendientes',
  vencida: 'Facturas vencidas',
  recurrente: 'Facturas recurrentes',
  presupuesto: 'Presupuestos aceptados',
  'gasto-recurrente': 'Gastos recurrentes',
  'gastos-variables': 'Gastos variables (estimados)',
  iva: 'IVA trimestral (estimado)',
};

const HORIZONTES = [3, 6, 12] as const;

const euros = (cents: number) => formatCurrency(cents);
const ejeEuros = (cents: number) =>
  new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100) + ' €';

const Kpi: React.FC<{ icono: React.ElementType; titulo: string; valor: string; nota?: string; tono?: string }> = ({ icono: Icono, titulo, valor, nota, tono = 'text-white' }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-4">
      <div className="p-3 rounded-full bg-primary-600/20 text-primary-400 shrink-0">
        <Icono className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-400 truncate">{titulo}</p>
        <p className={`text-2xl font-bold ${tono} truncate`}>{valor}</p>
        {nota && <p className="text-xs text-gray-500 truncate">{nota}</p>}
      </div>
    </CardContent>
  </Card>
);

const ForecastingPage: React.FC = () => {
  const { invoices, recurringInvoices, recurringExpenses, expenses, budgets, profile, getClientById, consumeCredits } = useAppStore(useShallow(s => ({
    invoices: s.invoices, recurringInvoices: s.recurringInvoices, recurringExpenses: s.recurringExpenses, expenses: s.expenses,
    budgets: s.budgets, profile: s.profile, getClientById: s.getClientById, consumeCredits: s.consumeCredits,
  })));
  const { addToast } = useToast();

  const [meses, setMeses] = useState<number>(6);
  const [incluirPresupuestos, setIncluirPresupuestos] = useState(true);
  const [saldoTexto, setSaldoTexto] = useState('');
  const [cobrado, setCobrado] = useState<Record<string, number>>({});
  const [analisis, setAnalisis] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [comprarCreditos, setComprarCreditos] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  // Cobros parciales: una factura pendiente solo aporta lo que falta por cobrar.
  const idsPendientes = useMemo(() => (invoices ?? []).filter(i => !i.paid).map(i => i.id), [invoices]);
  useEffect(() => {
    if (!idsPendientes.length) { setCobrado({}); return; }
    let vivo = true;
    supabase.from('payments').select('invoice_id, amount_cents').in('invoice_id', idsPendientes).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { console.error('Error cargando cobros parciales:', error.message); return; }
      const suma: Record<string, number> = {};
      for (const p of data ?? []) suma[p.invoice_id] = (suma[p.invoice_id] ?? 0) + (p.amount_cents ?? 0);
      setCobrado(suma);
    });
    return () => { vivo = false; };
  }, [idsPendientes]);

  const saldoInicialCents = useMemo(() => {
    const n = Number(saldoTexto.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }, [saldoTexto]);

  const presupuestosSinFacturar = useMemo(() => {
    const facturados = new Set((invoices ?? []).map(i => i.budget_id).filter(Boolean));
    return (budgets ?? []).filter(b => b.status === 'accepted' && !facturados.has(b.id))
      .map(b => ({ id: b.id, amount_cents: b.amount_cents, description: b.description }));
  }, [budgets, invoices]);

  const hoy = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD en la zona del navegador

  const prevision = useMemo(() => calcularPrevision({
    hoy,
    meses,
    facturas: invoices ?? [],
    cobradoPorFactura: cobrado,
    recurrentes: recurringInvoices ?? [],
    gastosRecurrentes: recurringExpenses ?? [],
    gastos: expenses ?? [],
    presupuestosSinFacturar,
    incluirPresupuestos,
    saldoInicialCents,
    nombreCliente: id => getClientById(id)?.name ?? 'Cliente',
  }), [hoy, meses, invoices, cobrado, recurringInvoices, recurringExpenses, expenses, presupuestosSinFacturar, incluirPresupuestos, saldoInicialCents, getClientById]);

  const hayDatos = prevision.movimientos.length > 0;
  const netoTotal = prevision.totalCobros - prevision.totalPagos;
  const saldoFinal = prevision.meses[prevision.meses.length - 1]?.saldo ?? 0;
  const conSaldo = saldoTexto.trim() !== '';
  const movimientosVisibles = verTodos ? prevision.movimientos : prevision.movimientos.slice(0, 12);

  const analizar = async () => {
    if ((profile?.ai_credits ?? 0) < AI_CREDIT_COSTS.generateForecast) { setComprarCreditos(true); return; }
    setAnalizando(true);
    setAnalisis(null);
    try {
      // Campos en *_cents: la Edge Function los pasa a euros antes de dárselos a la IA.
      const datos = prevision.meses.map(m => ({
        mes: m.etiqueta,
        cobros_previstos_cents: m.cobros,
        pagos_previstos_cents: m.pagos,
        neto_cents: m.neto,
        saldo_acumulado_cents: m.saldo,
        facturas_vencidas_cents: m.porTipo.vencida,
        iva_cents: -m.porTipo.iva,
      }));
      const res = await generateFinancialForecast([
        ...datos,
        { resumen: 'contexto', saldo_inicial_indicado: conSaldo, facturas_vencidas: prevision.vencidas.cantidad, facturas_vencidas_total_cents: prevision.vencidas.totalCents, gastos_variables_media_mensual_cents: prevision.mediaGastosVariablesCents },
      ]);
      setAnalisis(res.summary);
      consumeCredits(AI_CREDIT_COSTS.generateForecast);
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setAnalizando(false);
    }
  };

  const datosGrafico = prevision.meses.map(m => ({ mes: m.etiqueta, Cobros: m.cobros, Pagos: m.pagos, Saldo: m.saldo }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Previsión de tesorería</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl">
            Lo que va a entrar y salir de tu cuenta en los próximos meses, con tus facturas pendientes, recurrentes,
            presupuestos aceptados, gastos e IVA trimestral.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="block text-xs text-gray-400 mb-1">Horizonte</span>
            <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden" role="group" aria-label="Horizonte de la previsión">
              {HORIZONTES.map(h => (
                <button key={h} type="button" onClick={() => setMeses(h)}
                  className={`px-3 py-2 text-sm ${meses === h ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                  aria-pressed={meses === h}>
                  {h} meses
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1">Saldo actual en el banco (opcional)</span>
            <input inputMode="decimal" value={saldoTexto} onChange={e => setSaldoTexto(e.target.value)} placeholder="Ej. 4.250,00"
              className="w-40 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 pb-2">
            <input type="checkbox" checked={incluirPresupuestos} onChange={e => setIncluirPresupuestos(e.target.checked)} className="accent-primary-500" />
            Presupuestos aceptados sin facturar
          </label>
        </div>
      </div>

      {prevision.vencidas.cantidad > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-amber-100">
            Tienes <strong>{prevision.vencidas.cantidad} {prevision.vencidas.cantidad === 1 ? 'factura vencida' : 'facturas vencidas'}</strong> sin cobrar por{' '}
            <strong>{euros(prevision.vencidas.totalCents)}</strong>. La previsión las cuenta como cobro de este mes; si no las reclamas, no llegarán.{' '}
            <Link to="/invoices" className="underline text-amber-300 hover:text-amber-200">Ver facturas</Link>
          </div>
        </div>
      )}
      {conSaldo && prevision.mesesEnNegativo.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-100">
            Con estos datos, tu saldo se quedaría en negativo en <strong>{prevision.mesesEnNegativo.join(', ')}</strong>
            {prevision.saldoMinimo ? <> (mínimo {euros(prevision.saldoMinimo.saldo)} en {prevision.saldoMinimo.mes})</> : null}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icono={ArrowUpCircleIcon} titulo="Cobros previstos" valor={euros(prevision.totalCobros)} nota={`${meses} meses, incluido el actual`} />
        <Kpi icono={ArrowDownCircleIcon} titulo="Pagos previstos" valor={euros(prevision.totalPagos)} nota="Gastos e IVA estimados" />
        <Kpi icono={TrendingUpIcon} titulo="Resultado del periodo" valor={euros(netoTotal)} tono={netoTotal < 0 ? 'text-red-400' : 'text-green-400'} />
        <Kpi icono={DollarSignIcon} titulo={conSaldo ? 'Saldo al final' : 'Mes más ajustado'}
          valor={conSaldo ? euros(saldoFinal) : (prevision.saldoMinimo?.mes ?? '—')}
          nota={conSaldo ? undefined : 'Indica tu saldo para ver el acumulado real'}
          tono={conSaldo && saldoFinal < 0 ? 'text-red-400' : 'text-white'} />
      </div>

      {!hayDatos ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-400">
            Todavía no hay nada que prever: no tienes facturas pendientes, recurrentes, presupuestos aceptados ni gastos registrados.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-2">
              <CardHeader><h2 className="text-lg font-semibold text-white">Cobros y pagos por mes</h2></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosGrafico} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fill: '#a0a0a0', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={ejeEuros} tick={{ fill: '#a0a0a0', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }}
                        itemStyle={{ color: '#e5e7eb' }} cursor={{ fill: 'rgba(255,255,255,0.06)' }} formatter={(v: number) => euros(v)} />
                      <Legend wrapperStyle={{ color: '#a0a0a0', fontSize: 12 }} />
                      <Bar dataKey="Cobros" fill={COLOR_COBROS} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="Pagos" fill={COLOR_PAGOS} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-white">{conSaldo ? 'Saldo previsto' : 'Resultado acumulado'}</h2>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={datosGrafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fill: '#a0a0a0', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={ejeEuros} tick={{ fill: '#a0a0a0', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                      <ReferenceLine y={0} stroke="#6b7280" />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2c2c2c', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }}
                        itemStyle={{ color: '#e5e7eb' }} formatter={(v: number) => euros(v)} />
                      <Line type="monotone" dataKey="Saldo" name={conSaldo ? 'Saldo' : 'Acumulado'} stroke={COLOR_COBROS} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><h2 className="text-lg font-semibold text-white">Detalle por mes</h2></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="py-2 pr-4 font-medium">Concepto</th>
                    {prevision.meses.map(m => <th key={m.mes} className="py-2 px-2 font-medium text-right whitespace-nowrap">{m.etiqueta}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(NOMBRE_TIPO) as TipoMovimiento[])
                    .filter(t => prevision.meses.some(m => m.porTipo[t] !== 0))
                    .map(t => (
                      <tr key={t} className="border-b border-gray-800/60">
                        <td className="py-2 pr-4 text-gray-300 whitespace-nowrap">{NOMBRE_TIPO[t]}</td>
                        {prevision.meses.map(m => (
                          <td key={m.mes} className={`py-2 px-2 text-right tabular-nums ${m.porTipo[t] < 0 ? 'text-gray-400' : 'text-gray-200'}`}>
                            {m.porTipo[t] ? euros(m.porTipo[t]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  <tr className="border-b border-gray-800 font-semibold">
                    <td className="py-2 pr-4 text-white">Resultado del mes</td>
                    {prevision.meses.map(m => (
                      <td key={m.mes} className={`py-2 px-2 text-right tabular-nums ${m.neto < 0 ? 'text-red-400' : 'text-green-400'}`}>{euros(m.neto)}</td>
                    ))}
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2 pr-4 text-white">{conSaldo ? 'Saldo al final del mes' : 'Acumulado'}</td>
                    {prevision.meses.map(m => (
                      <td key={m.mes} className={`py-2 px-2 text-right tabular-nums ${m.saldo < 0 ? 'text-red-400' : 'text-white'}`}>{euros(m.saldo)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader><h2 className="text-lg font-semibold text-white">Próximos movimientos</h2></CardHeader>
              <CardContent>
                <ul className="divide-y divide-gray-800">
                  {movimientosVisibles.map((m, i) => (
                    <li key={`${m.fecha}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-gray-200 truncate">{m.concepto}</p>
                        <p className="text-xs text-gray-500">{formatearFecha(m.fecha)} · {NOMBRE_TIPO[m.tipo]}</p>
                      </div>
                      <span className={`tabular-nums shrink-0 font-medium ${m.importeCents < 0 ? 'text-gray-400' : 'text-green-400'}`}>
                        {m.importeCents > 0 ? '+' : ''}{euros(m.importeCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                {prevision.movimientos.length > 12 && (
                  <button type="button" onClick={() => setVerTodos(v => !v)} className="mt-3 text-sm text-primary-400 hover:text-primary-300">
                    {verTodos ? 'Ver menos' : `Ver los ${prevision.movimientos.length} movimientos`}
                  </button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">Análisis con IA</h2>
                  <Button onClick={analizar} disabled={analizando} size="sm">
                    {analizando ? <RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" /> : <SparklesIcon className="w-4 h-4 mr-2" />}
                    {analisis ? 'Volver a analizar' : 'Analizar'} ({AI_CREDIT_COSTS.generateForecast} créditos)
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {analisis ? (
                  <div className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">{analisis}</div>
                ) : (
                  <p className="text-sm text-gray-400">
                    La IA revisa esta previsión y te dice qué riesgos ve (meses flojos, dependencia de un cliente, facturas por reclamar) y qué puedes hacer.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <p className="text-xs text-gray-500">
        Cómo se calcula: las facturas pendientes, en su vencimiento (las vencidas, este mes); las recurrentes se cobran 30 días después de emitirse;
        los presupuestos aceptados sin factura, a mitad del mes que viene; los gastos variables son la media de los 3 meses anteriores
        ({euros(prevision.mediaGastosVariablesCents)} al mes); el IVA es el repercutido menos el soportado de cada trimestre, en su plazo
        del modelo 303. No incluye el IRPF (modelo 130) ni la cuota de autónomos. Es una estimación: confírmala con tu gestoría.
      </p>

      {comprarCreditos && (
        <Suspense fallback={null}>
          <BuyCreditsModal isOpen={comprarCreditos} creditosNecesarios={AI_CREDIT_COSTS.generateForecast} onClose={() => setComprarCreditos(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default ForecastingPage;
