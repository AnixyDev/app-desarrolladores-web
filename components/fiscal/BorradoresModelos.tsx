// Borradores del 303 y el 130 con sus casillas, listos para copiarlos en la
// web de la AEAT (14/10/2026, a petición de Ana). Sustituyen a los dos
// recuadros de «simulación» del Libro fiscal: el 130 de antes miraba solo el
// trimestre suelto con un porcentaje elegible, cuando el modelo real es
// acumulado desde el 1 de enero y siempre al 20 %.
import React from 'react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import { AlertTriangleIcon, CopyIcon, ExternalLinkIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import {
  esPersonaFisica,
  exencion130,
  importeParaAeat,
  type Minoracion,
  type Modelo130,
  type Modelo303,
  type Opciones130,
  type Plazo,
  type Trimestre,
} from '@/lib/modelosTrimestrales';
import type { FacturaModelo } from '@/lib/modelosTrimestrales';

const AEAT_303 = 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G414.shtml';
const AEAT_130 = 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G601.shtml';

interface FilaProps {
  casilla?: string;
  texto: string;
  cents: number;
  destacada?: boolean;
  /** Texto en lugar del importe con signo (p. ej. «A compensar»). */
  etiqueta?: string;
}

const Fila: React.FC<FilaProps> = ({ casilla, texto, cents, destacada, etiqueta }) => {
  const { addToast } = useToast();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(importeParaAeat(cents));
      addToast(`Copiado${casilla ? ` (casilla ${casilla})` : ''}: ${importeParaAeat(cents)}`, 'success');
    } catch {
      addToast('No se ha podido copiar. Escríbelo a mano: ' + importeParaAeat(cents), 'error');
    }
  };
  return (
    <div
      className={`flex items-center gap-2 py-2 ${destacada ? 'border-t border-gray-700 mt-1 pt-3' : 'border-t border-gray-800/60 first:border-t-0'}`}
    >
      <span className="w-10 shrink-0 text-center font-mono text-xs text-gray-400 bg-gray-800 rounded px-1 py-0.5">
        {casilla ?? '—'}
      </span>
      <span className={`flex-1 min-w-0 text-sm ${destacada ? 'text-white font-semibold' : 'text-gray-300'}`}>
        {texto}
        {etiqueta && <span className="block text-xs font-normal text-gray-400">{etiqueta}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${destacada ? 'text-lg font-bold text-white' : 'text-sm text-gray-200'}`}>
        {formatCurrency(cents)}
      </span>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar el importe${casilla ? ` de la casilla ${casilla}` : ''}`}
        title="Copiar para pegarlo en la AEAT"
        className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
      >
        <CopyIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

const LineaPlazo: React.FC<{ plazo: Plazo }> = ({ plazo }) => (
  <p className="text-xs text-gray-400 mt-1">
    Se presenta del {formatearFecha(plazo.desde)} al {formatearFecha(plazo.hasta)} (si domicilias el pago, hasta el{' '}
    {formatearFecha(plazo.domiciliarHasta)}).
  </p>
);

const Aviso: React.FC<{ children: React.ReactNode; tono?: 'info' | 'aviso' }> = ({ children, tono = 'info' }) => (
  <div
    className={`flex items-start gap-2 p-3 rounded text-xs ${
      tono === 'aviso' ? 'bg-orange-900/20 border border-orange-800 text-orange-200' : 'bg-blue-900/20 border border-blue-800 text-blue-200'
    }`}
  >
    <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
    <div>{children}</div>
  </div>
);

const etiqueta303 = (c71: number, t: Trimestre) => {
  if (c71 > 0) return 'A ingresar';
  if (c71 === 0) return 'Sin actividad o resultado cero';
  return t === 4 ? 'A devolver (o a compensar el año que viene)' : 'A compensar en los próximos trimestres';
};

export const Borrador303: React.FC<{ m: Modelo303; plazo: Plazo }> = ({ m, plazo }) => (
  <Card className="flex flex-col">
    <CardHeader>
      <h3 className="text-base font-semibold text-white">Modelo 303 · IVA del {m.trimestre}T {m.anio}</h3>
      <LineaPlazo plazo={plazo} />
    </CardHeader>
    <CardContent className="flex-1 flex flex-col gap-3">
      <div>
        {m.devengado.length === 0 && <Fila texto="IVA repercutido en tus facturas" cents={0} casilla="27" />}
        {m.devengado.map((l) => (
          <React.Fragment key={l.tipo}>
            <Fila casilla={l.casillas?.[0]} texto={`Base de tus facturas al ${l.tipo} %`} cents={l.base} />
            <Fila casilla={l.casillas?.[2]} texto={`Cuota de IVA al ${l.tipo} %`} cents={l.cuota} />
          </React.Fragment>
        ))}
        {m.devengado.length > 0 && <Fila casilla="27" texto="Total cuota devengada" cents={m.c27} />}
        <Fila casilla="28" texto="Base de tus gastos con IVA" cents={m.c28} />
        <Fila casilla="29" texto="IVA soportado en esos gastos" cents={m.c29} />
        <Fila casilla="45" texto="Total a deducir" cents={m.c45} />
        <Fila casilla="46" texto="Resultado del régimen general" cents={m.c46} />
        {m.c59 !== 0 && <Fila casilla="59" texto="Servicios a empresas de la UE (sin IVA)" cents={m.c59} />}
        {m.c120 !== 0 && <Fila casilla="120" texto="Servicios a clientes de fuera de la UE (no sujetos)" cents={m.c120} />}
        {m.c78 !== 0 && <Fila casilla="78" texto="Compensación de trimestres anteriores" cents={m.c78} />}
        <Fila casilla="71" texto="Resultado" etiqueta={etiqueta303(m.c71, m.trimestre)} cents={m.c71} destacada />
      </div>
      {m.devengado.some((l) => !l.casillas) && (
        <Aviso tono="aviso">Tienes facturas con un tipo de IVA distinto del 4, 10 o 21 %: revisa en qué casilla van.</Aviso>
      )}
      {m.c59 !== 0 && <Aviso>Con clientes empresa de la UE también tienes que presentar el modelo 349 en el mismo plazo.</Aviso>}
      <Aviso>
        Si pagas a proveedores de fuera de España que no te cobran IVA (GitHub, AWS, Google…), el 303 lleva además la
        «autorrepercusión» de ese IVA, que suma y resta lo mismo. La app aún no la calcula: coméntalo con tu gestoría.
      </Aviso>
      <a href={AEAT_303} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 text-sm text-primary-400 hover:underline">
        Presentar el 303 en la AEAT <ExternalLinkIcon className="w-3.5 h-3.5" />
      </a>
    </CardContent>
  </Card>
);

const MINORACIONES: { valor: Minoracion; texto: string }[] = [
  { valor: 100, texto: 'Hasta 9.000 € o sin actividad (100 €)' },
  { valor: 75, texto: 'De 9.000 a 10.000 € (75 €)' },
  { valor: 50, texto: 'De 10.000 a 11.000 € (50 €)' },
  { valor: 25, texto: 'De 11.000 a 12.000 € (25 €)' },
  { valor: 0, texto: 'Más de 12.000 € (sin minoración)' },
];

interface Borrador130Props {
  m: Modelo130;
  plazo: Plazo;
  opciones: Opciones130;
  onCambiarOpciones: (cambio: Partial<Opciones130>) => void;
  facturas: FacturaModelo[];
  nif?: string | null;
}

export const Borrador130: React.FC<Borrador130Props> = ({ m, plazo, opciones, onCambiarOpciones, facturas, nif }) => {
  if (!esPersonaFisica(nif)) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-white">Modelo 130 · IRPF</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-300">
            Tu NIF es de una sociedad: las sociedades no presentan el 130 (sus pagos a cuenta son el modelo 202). Coméntalo con tu gestoría.
          </p>
        </CardContent>
      </Card>
    );
  }
  const exencion = exencion130(facturas, m.anio);
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <h3 className="text-base font-semibold text-white">Modelo 130 · IRPF del {m.trimestre}T {m.anio}</h3>
        <LineaPlazo plazo={plazo} />
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {exencion?.exento && (
          <Aviso>
            El {String(exencion.porcentaje).replace('.', ',')} % de tus ingresos{' '}
            {exencion.segun === 'año anterior' ? 'del año pasado' : 'del primer trimestre'} llevó retención de IRPF: si es así,{' '}
            <strong>no tienes que presentar el 130</strong>. Te enseñamos el cálculo igualmente.
          </Aviso>
        )}
        <div>
          <Fila casilla="01" texto="Ingresos desde el 1 de enero" cents={m.c01} />
          <Fila
            casilla="02"
            texto="Gastos desde el 1 de enero"
            etiqueta={m.dificilJustificacion ? `Incluye ${formatCurrency(m.dificilJustificacion)} de gastos de difícil justificación (5 %)` : undefined}
            cents={m.c02}
          />
          <Fila casilla="03" texto="Rendimiento neto" cents={m.c03} />
          <Fila casilla="04" texto="20 % del rendimiento" cents={m.c04} />
          <Fila casilla="05" texto="Pagado en los trimestres anteriores" cents={m.c05} />
          <Fila casilla="06" texto="Retenciones de tus facturas" cents={m.c06} />
          <Fila casilla="07" texto="Pago fraccionado previo" cents={m.c07} />
          <Fila casilla="12" texto="Total (07, sin negativos)" cents={m.c12} />
          <Fila casilla="13" texto="Minoración por rendimientos bajos" cents={m.c13} />
          <Fila casilla="14" texto="Diferencia" cents={m.c14} />
          {m.c15 !== 0 && <Fila casilla="15" texto="Negativos de trimestres anteriores" cents={m.c15} />}
          <Fila
            casilla="19"
            texto="Resultado"
            etiqueta={m.c19 > 0 ? 'A ingresar' : m.c19 < 0 ? 'Negativo: se presenta igual y se resta en los próximos trimestres' : 'Cero: se presenta igual'}
            cents={m.c19}
            destacada
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <label className="flex items-start gap-2 text-gray-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={opciones.simplificada}
              onChange={(e) => onCambiarOpciones({ simplificada: e.target.checked })}
            />
            <span>
              Estimación directa simplificada
              <span className="block text-xs text-gray-400">La de casi todos los autónomos. Suma un 5 % de gastos de difícil justificación.</span>
            </span>
          </label>
          <label className="text-gray-300">
            <span className="block mb-1">Rendimiento neto del año pasado</span>
            <select
              value={opciones.minoracionEuros}
              onChange={(e) => onCambiarOpciones({ minoracionEuros: Number(e.target.value) as Minoracion })}
              className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white text-sm"
            >
              {MINORACIONES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Aviso>
          Se calcula con lo que has apuntado en la app y suponiendo que en los trimestres anteriores presentaste lo que sale aquí. Si
          tienes ordenador u otros bienes que se amortizan, o algún gasto que no es deducible, ajústalo con tu gestoría.
        </Aviso>
        <a href={AEAT_130} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 text-sm text-primary-400 hover:underline">
          Presentar el 130 en la AEAT <ExternalLinkIcon className="w-3.5 h-3.5" />
        </a>
      </CardContent>
    </Card>
  );
};
