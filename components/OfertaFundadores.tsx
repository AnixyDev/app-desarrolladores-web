import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { RefreshCwIcon } from '@/components/icons/Icon';
import { obtenerPlazasFundadores, type PlazasFundadores } from '@/services/stripeService';
import { precioDe } from '../supabase/functions/_shared/catalogo-stripe';

/**
 * Aviso del Plan Fundadores con el contador real de plazas.
 *
 * Todo sale del servidor (plazas-fundadores): cuántas quedan, si la oferta
 * sigue abierta y hasta cuándo. Mientras carga, si falla, si no quedan plazas
 * o si la oferta ha cerrado, no se muestra nada: nunca un número inventado.
 */
interface Props {
  textoBoton: string;
  onElegir: () => void | Promise<void>;
  cargando?: boolean;
}

/** "31/12/2026" a partir del instante de cierre (el último segundo abierto). */
function fechaDeCierre(cierreIso: string): string {
  const ultimo = new Date(new Date(cierreIso).getTime() - 1000);
  return ultimo.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' });
}

const OfertaFundadores: React.FC<Props> = ({ textoBoton, onElegir, cargando = false }) => {
  const [plazas, setPlazas] = useState<PlazasFundadores | null>(null);

  useEffect(() => {
    let vivo = true;
    obtenerPlazasFundadores().then((p) => { if (vivo) setPlazas(p); });
    return () => { vivo = false; };
  }, []);

  const precio = precioDe('proPlanFundadores');
  if (!plazas || !plazas.disponible || plazas.restantes <= 0 || !precio) return null;

  const ocupadas = plazas.total - plazas.restantes;
  const porcentaje = Math.min(100, Math.round((ocupadas / plazas.total) * 100));

  return (
    <section
      aria-label="Plan Fundadores"
      className="max-w-5xl mx-auto rounded-3xl border border-primary-500/40 bg-gradient-to-br from-primary-500/10 via-gray-900 to-gray-950 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-400">Plan Fundadores</p>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Freelancer Pro por {precio.precio}/{precio.periodo}, para siempre
          </h2>
          <p className="text-sm text-gray-400">
            Solo para los {plazas.total} primeros clientes y hasta el {fechaDeCierre(plazas.cierre)}. Mientras mantengas la suscripción, no te subimos el precio.
          </p>
        </div>
        <div className="w-full md:w-64 shrink-0 space-y-3">
          <p className="text-sm font-semibold text-white" aria-live="polite">
            Quedan {plazas.restantes} de {plazas.total} plazas
          </p>
          <div className="h-2 w-full rounded-full bg-gray-800" role="progressbar" aria-valuemin={0} aria-valuemax={plazas.total} aria-valuenow={ocupadas}>
            <div className="h-2 rounded-full bg-primary-500" style={{ width: `${porcentaje}%` }} />
          </div>
          <Button onClick={onElegir} disabled={cargando} className="w-full h-11 rounded-xl text-sm font-bold">
            {cargando ? <RefreshCwIcon className="w-5 h-5 animate-spin mx-auto" /> : textoBoton}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default OfertaFundadores;
