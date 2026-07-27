import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Briefcase, Clock, FileText, Menu } from 'lucide-react';

interface MobileBottomNavProps {
  /** Abre el drawer completo del Sidebar (Clientes, Finanzas, Reportes, Equipo, Ajustes...) */
  onMoreClick: () => void;
}

// Solo los 4 destinos de uso más frecuente + "Más" para todo lo demás — un
// tab bar con más de 5 opciones deja de ser manejable con el pulgar.
const TABS = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Proyectos', icon: Briefcase, end: false },
  { to: '/time-tracking', label: 'Horas', icon: Clock, end: false },
  { to: '/invoices', label: 'Facturas', icon: FileText, end: false },
];

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onMoreClick }) => {
  const tabBase =
    'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-semibold transition-colors';

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-gray-800 bg-gray-950/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación principal"
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `${tabBase} ${isActive ? 'text-primary-400' : 'text-gray-500 hover:text-gray-300'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              {label}
            </>
          )}
        </NavLink>
      ))}

      <button
        type="button"
        onClick={onMoreClick}
        className={`${tabBase} text-gray-500 hover:text-gray-300`}
        aria-label="Más opciones"
      >
        <Menu className="w-5 h-5" />
        Más
      </button>
    </nav>
  );
};

export default MobileBottomNav;