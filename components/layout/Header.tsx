
import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import {
  MenuIcon as Menu,
  BellIcon as Bell,
  LogOutIcon as LogOut,
  UserIcon as User,
  FileTextIcon,
  BriefcaseIcon,
  SearchIcon,
  SettingsIcon,
} from '../icons/Icon';
import { Link } from 'react-router-dom';

interface HeaderProps {
  onMenuClick: () => void;
}

const NotificationIcon = ({ link }: { link: string }) => {
  if (link.includes('/invoices')) return <FileTextIcon className="w-5 h-5 text-green-400" />;
  if (link.includes('/projects')) return <BriefcaseIcon className="w-5 h-5 text-purple-400" />;
  return <Bell className="w-5 h-5 text-gray-400" />;
};

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { profile, logout, notifications, markAllAsRead, markAsRead } = useAppStore();

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isExternalLink = (url: string) =>
    url.startsWith('http://') || url.startsWith('https://');

  return (
    <header className="h-20 bg-gray-950/80 backdrop-blur-md border-b border-gray-800 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
      {/* LEFT */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition"
          aria-label="Abrir menú"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* SEARCH */}
      <div className="hidden md:flex flex-1 max-w-lg mx-4">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SearchIcon className="w-4 h-4 text-gray-500" />
          </div>
          <input
            type="text"
            placeholder="Buscar proyectos, clientes, facturas..."
            className="w-full pl-10 pr-3 py-2 bg-gray-900/60 border border-gray-700 rounded-lg text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setIsNotificationsOpen(p => !p)}
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-primary-500 rounded-full ring-2 ring-gray-950" />
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 z-50">
              <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                  <h4 className="font-semibold text-white">Notificaciones</h4>
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-primary-400 hover:underline"
                  >
                    Marcar todo como leído
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center text-gray-500">
                      <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No tienes notificaciones.</p>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const content = (
                        <div className="flex gap-4 p-4 hover:bg-gray-800/60 transition">
                          <div className="p-2 bg-gray-800 rounded-full border border-gray-700">
                            <NotificationIcon link={n.link} />
                          </div>
                          <div className="flex-1">
                            <p className={`text-sm ${!n.isRead ? 'text-white font-medium' : 'text-gray-400'}`}>
                              {String(n.message)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(n.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      );

                      if (isExternalLink(n.link)) {
                        return (
                          <a
                            key={n.id}
                            href={n.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              markAsRead(n.id);
                              setIsNotificationsOpen(false);
                            }}
                          >
                            {content}
                          </a>
                        );
                      }

                      return (
                        <Link
                          key={n.id}
                          to={n.link}
                          onClick={() => {
                            markAsRead(n.id);
                            setIsNotificationsOpen(false);
                          }}
                        >
                          {content}
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen(p => !p)}
            className="flex items-center gap-3 p-1.5 rounded-full hover:bg-gray-800"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="w-8 h-8 rounded-full object-cover ring-2 ring-gray-800"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center ring-2 ring-gray-800">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
              <Link
                to="/settings"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex items-center px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800"
              >
                <SettingsIcon className="w-4 h-4 mr-3" />
                Ajustes
              </Link>
              <button
                onClick={logout}
                className="w-full text-left flex items-center px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="w-4 h-4 mr-3" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
