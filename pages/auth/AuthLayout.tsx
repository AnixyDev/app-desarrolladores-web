import React from 'react';
import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';

const AuthLayout: React.FC = () => {
    return (
        <div className="relative min-h-screen bg-gray-950 flex flex-col justify-center items-center p-4 overflow-hidden">
            {/* Ambiente de marca: dos glows suaves con los mismos tonos del logo (magenta -> morado) */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-primary-600/20 blur-[110px]"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-purple-700/20 blur-[110px]"
            />
            {/* Retícula sutil: guiño a la audiencia developer sin ser literal */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                    backgroundImage:
                        'linear-gradient(to right, #6b7280 1px, transparent 1px), linear-gradient(to bottom, #6b7280 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                }}
            />

            <div className="relative flex flex-col items-center mb-8">
                <div className="flex items-center">
                    <Logo className="h-10 w-10 mr-3" />
                    <span className="text-3xl font-black italic tracking-tight text-white">DevFreelancer</span>
                </div>
                <p className="mt-2 font-mono text-xs text-gray-500">
                    // gestión para developers freelance
                </p>
            </div>

            <main className="relative w-full max-w-md">
                <Outlet />
            </main>
        </div>
    );
};
export default AuthLayout;