import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import { ShieldCheckIcon, XIcon } from 'lucide-react';

const CookieBanner: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem('df_cookie_consent');
        if (!consent) {
            // Retardo de 1s para una aparición más elegante
            const timer = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('df_cookie_consent', 'true');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
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
                                Utilizamos cookies propias y de terceros para mejorar tu experiencia y analizar el uso de nuestra web. Al continuar navegando, aceptas nuestra <Link to="/politica-de-privacidad" className="text-primary-400 hover:underline">Política de Privacidad</Link>.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button 
                                size="sm" 
                                onClick={handleAccept}
                                className="px-6 py-2 bg-white text-black hover:bg-gray-200 border-none text-xs font-bold rounded-lg"
                            >
                                Aceptar
                            </Button>
                            <Link 
                                to="/politica-de-privacidad" 
                                className="text-[11px] font-bold text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wider"
                            >
                                Configurar
                            </Link>
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