import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import Modal from './Modal';
import { ShieldCheckIcon, XIcon } from 'lucide-react';

type CookiePrefs = {
    analytics: boolean;
    marketing: boolean;
};

const STORAGE_KEY = 'df_cookie_consent';
const PREFS_KEY = 'df_cookie_prefs';

const CookieBanner: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [prefs, setPrefs] = useState<CookiePrefs>({ analytics: true, marketing: false });

    useEffect(() => {
        const consent = localStorage.getItem(STORAGE_KEY);
        if (!consent) {
            // Retardo de 1s para una aparición más elegante
            const timer = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    const persistConsent = (savedPrefs: CookiePrefs) => {
        localStorage.setItem(STORAGE_KEY, 'true');
        localStorage.setItem(PREFS_KEY, JSON.stringify(savedPrefs));
        setIsVisible(false);
        setIsConfigOpen(false);
    };

    // FIX: aceptaba solo con las cookies "necesarias" quedando marcadas,
    // pero no guardaba ninguna preferencia real. Ahora "Aceptar" acepta todo.
    const handleAcceptAll = () => {
        persistConsent({ analytics: true, marketing: true });
    };

    // FIX: "Configurar" antes enlazaba a la misma URL rota que "Política de
    // Privacidad" (/politica-de-privacidad, ruta inexistente) — no abría
    // ninguna configuración real. Ahora abre un modal de verdad con
    // preferencias por categoría, y las guarda al confirmar.
    const handleSavePrefs = () => {
        persistConsent(prefs);
    };

    if (!isVisible) return null;

    return (
        <>
            <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[100] animate-fade-in-up">
                <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800 p-5 rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10">
                    <div className="flex items-start gap-4">
                        <div className="bg-primary-500/20 p-2 rounded-xl shrink-0">
                            <ShieldCheckIcon className="w-6 h-6 text-primary-400" />
                        </div>
                        <div className="flex-1 space-y-3">
                            <div>
                                <h4 className="text-sm font-bold text-white mb-1">Tu privacidad nos importa</h4>
                                <p className="text-xs leading-relaxed text-gray-400">
                                    Utilizamos cookies propias y de terceros para mejorar tu experiencia y analizar el uso de nuestra web. Al continuar navegando, aceptas nuestra{' '}
                                    {/* FIX: la ruta real registrada en App.tsx es /privacy, no /politica-de-privacidad */}
                                    <Link to="/privacy" className="text-primary-400 hover:underline">Política de Privacidad</Link>.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={handleAcceptAll}
                                    className="px-6 py-2 text-xs font-bold rounded-lg"
                                >
                                    Aceptar
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => setIsConfigOpen(true)}
                                    className="text-[11px] font-bold text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wider"
                                >
                                    Configurar
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsVisible(false)}
                            className="text-gray-600 hover:text-gray-400 transition-colors"
                            aria-label="Cerrar aviso"
                        >
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <Modal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} title="Preferencias de cookies">
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4 p-3 bg-gray-800/50 rounded-lg">
                        <div>
                            <p className="text-sm font-bold text-white">Necesarias</p>
                            <p className="text-xs text-gray-400">Imprescindibles para que la web funcione (sesión, seguridad). No se pueden desactivar.</p>
                        </div>
                        <input type="checkbox" checked disabled className="mt-1 w-4 h-4 accent-primary-500 opacity-60" />
                    </div>

                    <div className="flex items-start justify-between gap-4 p-3 bg-gray-800/50 rounded-lg">
                        <div>
                            <p className="text-sm font-bold text-white">Analíticas</p>
                            <p className="text-xs text-gray-400">Nos ayudan a entender cómo se usa la web para mejorarla.</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={prefs.analytics}
                            onChange={(e) => setPrefs(p => ({ ...p, analytics: e.target.checked }))}
                            className="mt-1 w-4 h-4 accent-primary-500"
                        />
                    </div>

                    <div className="flex items-start justify-between gap-4 p-3 bg-gray-800/50 rounded-lg">
                        <div>
                            <p className="text-sm font-bold text-white">Marketing</p>
                            <p className="text-xs text-gray-400">Para mostrarte contenido y ofertas relevantes.</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={prefs.marketing}
                            onChange={(e) => setPrefs(p => ({ ...p, marketing: e.target.checked }))}
                            className="mt-1 w-4 h-4 accent-primary-500"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setIsConfigOpen(false)}>Cancelar</Button>
                        <Button type="button" variant="primary" onClick={handleSavePrefs}>Guardar preferencias</Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default CookieBanner;

// Añadimos la animación a los estilos globales si no existe
const style = document.createElement('style');
style.innerHTML = `
    @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in-up {
        animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
`;
document.head.appendChild(style);