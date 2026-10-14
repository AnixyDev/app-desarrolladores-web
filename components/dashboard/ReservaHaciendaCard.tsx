// «Reserva para Hacienda» en Inicio (14/10/2026, a petición de Ana): cuánto
// apartar para el IVA (303) y el IRPF (130) del trimestre en curso y, si su
// plazo está abierto, lo que toca presentar ya del trimestre anterior.
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/hooks/useAppStore';
import { useOpciones130 } from '@/hooks/useOpciones130';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import { hoyTexto, reservaHacienda, type ImporteTrimestre } from '@/lib/modelosTrimestrales';

const enlace = (i: ImporteTrimestre) => `/tax-ledger?anio=${i.anio}&trimestre=${i.trimestre}`;

const SIN_130 = {
  retenciones: 'IRPF: sin 130 (tus clientes ya te retienen)',
  sociedad: 'IRPF: las sociedades no presentan el 130',
} as const;

const Desglose: React.FC<{ i: ImporteTrimestre; sin130: keyof typeof SIN_130 | null }> = ({ i, sin130 }) => (
  <p className="text-sm text-gray-300">
    IVA (303): <span className="font-semibold text-white">{formatCurrency(i.iva)}</span>
    {' · '}
    {!sin130 ? (
      <>
        IRPF (130): <span className="font-semibold text-white">{formatCurrency(i.irpf)}</span>
      </>
    ) : (
      <span className="text-gray-400">{SIN_130[sin130]}</span>
    )}
  </p>
);

const ReservaHaciendaCard: React.FC = () => {
  const { profile, invoices, expenses } = useAppStore(
    useShallow((s) => ({ profile: s.profile, invoices: s.invoices, expenses: s.expenses })),
  );
  const hoy = hoyTexto();
  const [opciones130] = useOpciones130(profile?.id, Number(hoy.slice(0, 4)), invoices, expenses);

  const reserva = useMemo(
    () => reservaHacienda(invoices, expenses, hoy, { nif: profile?.tax_id, opciones130 }),
    [invoices, expenses, hoy, profile?.tax_id, opciones130],
  );
  const { enCurso, porPresentar, motivoSin130 } = reserva;
  const pendiente = porPresentar?.hayDatos ? porPresentar : null;
  const sinDatos = !enCurso.hayDatos && !pendiente;

  return (
    <section aria-labelledby="reserva-hacienda" className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 id="reserva-hacienda" className="flex items-center gap-2 text-base sm:text-lg font-semibold text-white">
          <Landmark className="w-5 h-5 text-amber-400" aria-hidden="true" />
          Reserva para Hacienda
        </h3>
        <Link to={enlace(pendiente ?? enCurso)} className="text-sm text-primary-400 hover:underline shrink-0">
          Ver borradores →
        </Link>
      </div>

      {sinDatos ? (
        <p className="text-sm text-gray-400">
          Cuando emitas facturas o apuntes gastos, aquí verás cuánto guardar cada trimestre para el IVA y el IRPF.
        </p>
      ) : (
        <div className={`grid gap-4 ${pendiente ? 'md:grid-cols-2' : ''}`}>
          {pendiente && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Toca presentar el {pendiente.trimestre}T {pendiente.anio}
              </p>
              <p className="text-3xl font-bold text-white mt-1 tabular-nums">{formatCurrency(pendiente.total)}</p>
              <Desglose i={pendiente} sin130={motivoSin130} />
              <p className="text-xs text-amber-200/90 mt-2">
                Plazo hasta el {formatearFecha(pendiente.plazo.hasta)} (si domicilias el pago, hasta el{' '}
                {formatearFecha(pendiente.plazo.domiciliarHasta)}).{' '}
                <Link to={enlace(pendiente)} className="underline">
                  Ver casillas
                </Link>
              </p>
            </div>
          )}
          <div className={pendiente ? 'rounded-2xl border border-gray-800 p-4' : ''}>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Aparta para el {enCurso.trimestre}T {enCurso.anio} (hasta hoy)
            </p>
            <p className="text-3xl font-bold text-white mt-1 tabular-nums">{formatCurrency(enCurso.total)}</p>
            <Desglose i={enCurso} sin130={motivoSin130} />
            <p className="text-xs text-gray-400 mt-2">
              Se presenta del {formatearFecha(enCurso.plazo.desde)} al {formatearFecha(enCurso.plazo.hasta)}. Estimación con lo que has
              apuntado en la app.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default ReservaHaciendaCard;
