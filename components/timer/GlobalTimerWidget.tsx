import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Square } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { useToast } from '@/hooks/useToast';
import { formatDuration } from '@/lib/utils';

// Página donde el cronómetro ya se muestra en grande, in-context — mostrar
// también el widget flotante ahí sería un duplicado sin sentido.
const TIMER_HOME_ROUTE = '/my-timesheet';

const PulsingDot: React.FC = () => (
  <span className="relative flex h-2.5 w-2.5 shrink-0">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
  </span>
);

const GlobalTimerWidget: React.FC = () => {
  const activeTimer = useAppStore(state => state.activeTimer);
  const stopTimer = useAppStore(state => state.stopTimer);
  const getProjectById = useAppStore(state => state.getProjectById);
  const elapsed = useElapsedTime(activeTimer);
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();

  if (!activeTimer || location.pathname === TIMER_HOME_ROUTE) return null;

  const project = getProjectById(activeTimer.projectId);
  const label = activeTimer.description || project?.name || 'Cronómetro en marcha';

  const handleStop = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const description = activeTimer.description;
    const result = await stopTimer();
    if (result.success) {
      addToast(`Tiempo registrado para "${description}"`, 'success');
    } else {
      addToast(result.message || 'No se pudo registrar el tiempo.', 'error');
    }
  };

  return (
    <>
      {/* Desktop: píldora flotante — patrón estándar (Toggl, Intercom...) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(TIMER_HOME_ROUTE)}
        onKeyDown={(e) => { if (e.key === 'Enter') navigate(TIMER_HOME_ROUTE); }}
        className="hidden md:flex fixed bottom-6 right-6 z-40 items-center gap-3 rounded-2xl border border-primary-500/30 bg-gray-900 py-2.5 pl-4 pr-2 shadow-2xl shadow-black/50 transition-colors hover:border-primary-500/60 cursor-pointer"
      >
        <PulsingDot />
        <div className="text-left">
          <p className="max-w-[160px] truncate text-[11px] text-gray-400">{label}</p>
          <p className="font-mono text-sm font-bold tabular-nums text-white">{formatDuration(elapsed)}</p>
        </div>
        <button
          type="button"
          onClick={handleStop}
          aria-label="Detener cronómetro"
          className="ml-1 rounded-xl bg-red-500/10 p-2 text-red-400 transition-colors hover:bg-red-500/20"
        >
          <Square className="h-4 w-4" fill="currentColor" />
        </button>
      </div>

      {/* Móvil: barra tipo "mini-player", justo encima del menú inferior */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(TIMER_HOME_ROUTE)}
        onKeyDown={(e) => { if (e.key === 'Enter') navigate(TIMER_HOME_ROUTE); }}
        className="md:hidden fixed left-0 right-0 z-40 flex items-center gap-3 border-t border-primary-500/30 bg-gray-900 px-4 py-2.5 cursor-pointer"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <PulsingDot />
        <p className="min-w-0 flex-1 truncate text-xs text-gray-300">{label}</p>
        <p className="shrink-0 font-mono text-sm font-bold tabular-nums text-white">{formatDuration(elapsed)}</p>
        <button
          type="button"
          onClick={handleStop}
          aria-label="Detener cronómetro"
          className="ml-1 shrink-0 rounded-xl bg-red-500/10 p-2 text-red-400"
        >
          <Square className="h-4 w-4" fill="currentColor" />
        </button>
      </div>
    </>
  );
};

export default GlobalTimerWidget;