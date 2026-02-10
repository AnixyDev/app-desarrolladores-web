import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom'; // Añadido useNavigate
import { SIDEBAR_STRUCTURE } from '@/constants';
import { Logo } from '../icons/Logo';
import { ChevronDown, X, LogOut } from 'lucide-react'; // Añadido LogOut
import * as Icons from '../icons/Icon';
import { useAppStore } from '@/hooks/useAppStore'; // Añadido para gestionar la sesión
import { supabase } from '@/lib/supabaseClient'; // Añadido para el signout

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const DynamicIcon = ({ name, className }: { name: string; className: string }) => {
  const IconComponent = (Icons as any)[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navigate = useNavigate();
  const logoutAction = useAppStore(state => state.logout); // Obtenemos la función logout del store

  const handleGroupClick = (label: string) => {
    setOpenGroup(openGroup === label ? null : label);
  };

  const handleLinkClick = () => {
    if (window.innerWidth < 768) onClose();
  };

  // FUNCIÓN DE CIERRE DE SESIÓN REFORZADA
  const handleLogout = async () => {
    try {
      // 1. Intentar cerrar sesión en Supabase
      await supabase.auth.signOut();
      
      // 2. Limpiar estado local (Zustand)
      if (logoutAction) logoutAction();

      // 3. Limpiar almacenamiento local por seguridad
      localStorage.clear();
      
      // 4. Redirigir al login
      navigate('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      // Forzar salida incluso con error
      window.location.href = '/auth/login';
    }
  };

  const isExternalLink = (url: string) =>
    url.startsWith('http://') || url.startsWith('https://');

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:relative inset-y-0 left-0 w-[280px] md:w-64
        bg-gray-950 border-r border-gray-800 flex flex-col z-50
        transform transition-transform duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {/* Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-8" />
            <span className="text-xl font-black text-white italic tracking-tighter">
              DEVFL
            </span>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-2 text-gray-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
          {SIDEBAR_STRUCTURE.map(item => {
            if (item.type === 'link') {
              const base =
                'flex items-center px-4 py-3 text-sm font-semibold rounded-xl transition';

              if (isExternalLink(item.href)) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${base} text-gray-400 hover:bg-gray-900 hover:text-white`}
                  >
                    <DynamicIcon name={item.icon as string} className="w-5 h-5 mr-3" />
                    {item.label}
                  </a>
                );
              }

              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === '/'}
                  onClick={handleLinkClick}
                  className={({ isActive }) =>
                    `${base} ${
                      isActive
                        ? 'bg-primary-600/10 text-primary-400'
                        : 'text-gray-400 hover:bg-gray-900 hover:text-white'
                    }`
                  }
                >
                  <DynamicIcon name={item.icon as string} className="w-5 h-5 mr-3" />
                  {item.label}
                </NavLink>
              );
            }

            if (item.type === 'group') {
              const isOpenGroup = openGroup === item.label;

              return (
                <div key={item.label}>
                  <button
                    onClick={() => handleGroupClick(item.label)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition
                    ${isOpenGroup ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-900 hover:text-white'}`}
                  >
                    <div className="flex items-center">
                      <DynamicIcon
                        name={item.icon as string}
                        className={`w-5 h-5 mr-3 ${isOpenGroup ? 'text-primary-400' : ''}`}
                      />
                      {item.label}
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isOpenGroup ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpenGroup && (
                    <div className="mt-1 ml-6 pl-4 border-l border-gray-800 space-y-1">
                      {item.items?.map(sub => (
                        <NavLink
                          key={sub.href}
                          to={sub.href}
                          onClick={handleLinkClick}
                          className={({ isActive }) =>
                            `flex items-center px-3 py-2 rounded-lg text-sm transition
                            ${
                              isActive
                                ? 'text-primary-400'
                                : 'text-gray-400 hover:text-white'
                            }`
                          }
                        >
                          <DynamicIcon
                            name={sub.icon as string}
                            className="w-4 h-4 mr-3"
                          />
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}
        </nav>

        {/* Footer con Botón de Logout */}
        <div className="p-4 border-t border-gray-800 space-y-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/10 rounded-xl transition group"
          >
            <LogOut className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
            Cerrar Sesión
          </button>

          <div className="p-4 rounded-2xl bg-gradient-to-r from-primary-900/10 to-purple-900/10 border border-primary-500/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase text-gray-400">
                Sistema Operativo V1.0
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
