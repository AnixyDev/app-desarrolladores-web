// Las dos opciones del borrador del 130 que la app no puede saber sola:
// si el usuario está en estimación directa simplificada y la minoración de la
// casilla 13 (depende del rendimiento del año anterior). Se recuerdan en este
// navegador; si no hay nada guardado, la minoración se deduce de los datos del
// año anterior que haya en la app (sin datos = sin actividad = 100 €).
import { useCallback, useMemo, useState } from 'react';
import {
  OPCIONES_130_POR_DEFECTO,
  minoracionPorRendimiento,
  rendimientoNetoAnual,
  type FacturaModelo,
  type GastoModelo,
  type Opciones130,
} from '@/lib/modelosTrimestrales';

const clave = (userId: string | undefined, anio: number) => `devf.opciones130.${userId ?? 'anonimo'}.${anio}`;

const leer = (k: string): Partial<Opciones130> | null => {
  try {
    const crudo = window.localStorage.getItem(k);
    return crudo ? (JSON.parse(crudo) as Partial<Opciones130>) : null;
  } catch {
    return null;
  }
};

export function useOpciones130(
  userId: string | undefined,
  anio: number,
  facturas: FacturaModelo[],
  gastos: GastoModelo[],
): [Opciones130, (cambio: Partial<Opciones130>) => void] {
  const k = clave(userId, anio);
  const [guardadas, setGuardadas] = useState<{ k: string; v: Partial<Opciones130> | null }>(() => ({ k, v: leer(k) }));
  const actuales = guardadas.k === k ? guardadas.v : leer(k);

  const porDefecto = useMemo<Opciones130>(() => {
    const simplificada = actuales?.simplificada ?? OPCIONES_130_POR_DEFECTO.simplificada;
    return {
      simplificada,
      minoracionEuros: minoracionPorRendimiento(rendimientoNetoAnual(facturas, gastos, anio - 1, simplificada)),
    };
  }, [facturas, gastos, anio, actuales?.simplificada]);

  const opciones = useMemo<Opciones130>(
    () => ({ ...porDefecto, ...(actuales ?? {}) }),
    [porDefecto, actuales?.simplificada, actuales?.minoracionEuros], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const cambiar = useCallback(
    (cambio: Partial<Opciones130>) => {
      const v = { ...(leer(k) ?? {}), ...cambio };
      try {
        window.localStorage.setItem(k, JSON.stringify(v));
      } catch {
        // Sin almacenamiento (modo privado): vale solo para esta visita.
      }
      setGuardadas({ k, v });
    },
    [k],
  );

  return [opciones, cambiar];
}
