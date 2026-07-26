import React from 'react';
import { Link } from 'react-router-dom';

const AuthCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="relative bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl shadow-2xl shadow-black/40 w-full flex flex-col overflow-hidden">
            {/* Acento de marca: línea de degradado, el mismo gradiente que el logo */}
            <div className="h-[3px] w-full bg-gradient-to-r from-[#F000B8] to-[#9D00FF]" aria-hidden="true" />
            <div className="p-8">
                {children}
            </div>
            <div className="p-4 border-t border-gray-800 bg-gray-800/20 text-center mt-auto flex flex-wrap justify-center gap-4">
                <Link to="/privacy" className="text-xs text-gray-500 hover:text-gray-300 hover:underline">
                    Privacidad
                </Link>
                <Link to="/terms" className="text-xs text-gray-500 hover:text-gray-300 hover:underline">
                    Términos y Condiciones
                </Link>
            </div>
        </div>
    );
};
export default AuthCard;