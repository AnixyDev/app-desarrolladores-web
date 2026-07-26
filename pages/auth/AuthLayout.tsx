import React from 'react';
import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import { FileTextIcon, ClockIcon, CreditCard, ReceiptIcon } from '@/components/icons/Icon';

const VALUE_PROPS = [
    { icon: FileTextIcon, label: 'Facturación en segundos' },
    { icon: ClockIcon, label: 'Time tracking por proyecto' },
    { icon: CreditCard, label: 'Cobros con Stripe integrados' },
];

// Firma visual del panel izquierdo: una tarjeta estática que evoca una
// factura real de la app (sin ser un componente vivo/mantenido aparte),
// en JetBrains Mono para las cifras — el mismo lenguaje visual que usa
// el resto del producto para datos numéricos.
const InvoicePreviewCard: React.FC = () => (
    <div className="relative w-full max-w-xs rounded-xl border border-gray-800 bg-gray-900/80 p-4 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600/20 text-primary-400">
                    <ReceiptIcon className="h-4 w-4" />
                </div>
                <span className="font-mono text-xs text-gray-400">FACT-0042</span>
            </div>
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 font-mono text-[10px] text-green-400">
                PAGADA
            </span>
        </div>
        <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Desarrollo API REST</span>
                <span className="font-mono text-gray-300">1.200,00 €</span>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Mantenimiento mensual</span>
                <span className="font-mono text-gray-300">350,00 €</span>
            </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-gray-800 pt-3">
            <span className="text-xs font-medium text-gray-400">Total</span>
            <span className="font-mono text-sm font-semibold text-white">1.550,00 €</span>
        </div>
    </div>
);

const AuthLayout: React.FC = () => {
    return (
        <div className="relative min-h-screen bg-gray-950 overflow-hidden lg:grid lg:grid-cols-2">
            {/* Ambiente de marca: glows con los mismos tonos del logo (magenta -> morado) */}
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

            {/* Panel izquierdo: solo desktop (lg+). Cuenta qué es DevFreelancer sin decirlo con un párrafo. */}
            <div className="relative hidden lg:flex lg:flex-col lg:items-start lg:justify-center lg:px-16 xl:px-24">
                <div className="flex items-center">
                    <Logo className="h-10 w-10 mr-3" />
                    <span className="text-3xl font-black italic tracking-tight text-white">DevFreelancer</span>
                </div>
                <p className="mt-2 font-mono text-xs text-gray-500">// gestión para developers freelance</p>

                <ul className="mt-10 space-y-4">
                    {VALUE_PROPS.map(({ icon: Icon, label }) => (
                        <li key={label} className="flex items-center gap-3 text-sm text-gray-300">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800/80 text-primary-400">
                                <Icon className="h-4 w-4" />
                            </span>
                            {label}
                        </li>
                    ))}
                </ul>

                <div className="mt-12">
                    <InvoicePreviewCard />
                </div>
            </div>

            {/* Panel derecho: formulario. En móvil ocupa toda la pantalla y muestra la cabecera propia. */}
            <div className="relative flex flex-col items-center justify-center p-4 sm:p-8">
                <div className="mb-8 flex flex-col items-center lg:hidden">
                    <div className="flex items-center">
                        <Logo className="h-10 w-10 mr-3" />
                        <span className="text-3xl font-black italic tracking-tight text-white">DevFreelancer</span>
                    </div>
                    <p className="mt-2 font-mono text-xs text-gray-500">// gestión para developers freelance</p>
                </div>

                <main className="w-full max-w-md">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
export default AuthLayout;