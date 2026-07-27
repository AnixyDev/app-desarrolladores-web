import { useEffect, useState } from 'react';
import { ActiveTimer } from '@/hooks/store/projectSlice';

/**
 * Devuelve los segundos transcurridos de un cronómetro activo, refrescando
 * cada segundo. El tiempo real siempre se recalcula desde `startedAt`
 * (no desde un contador acumulado), así que es correcto sin importar
 * cuánto tiempo ha pasado desde el último render — sobrevive a cambios de
 * página, a que el componente se desmonte, o a dejar la pestaña en segundo
 * plano y volver.
 */
export function useElapsedTime(activeTimer: ActiveTimer | null): number {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!activeTimer) return;
    const interval = window.setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  if (!activeTimer) return 0;
  return Math.floor((Date.now() - activeTimer.startedAt) / 1000);
}