// Página pública tras eliminar la cuenta (30/09/2026).
import React from 'react';
import { Link } from 'react-router-dom';
import PieLegal from '@/components/PieLegal';

const CuentaEliminadaPage: React.FC = () => (
  <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 p-4">
    <div className="max-w-md w-full rounded-xl border border-gray-800 bg-gray-900 p-8 text-center space-y-4">
      <h1 className="text-2xl font-bold text-white">Tu cuenta se ha eliminado</h1>
      <p className="text-gray-400">
        Hemos borrado tus datos y cancelado tu suscripción, si tenías una. Tus facturas y registros fiscales se conservan
        bloqueados el tiempo que obliga la ley y después se borran solos.
      </p>
      <p className="text-gray-500 text-sm">Gracias por haber usado DevFreelancer.</p>
      <Link to="/" className="inline-block text-primary-400 hover:text-primary-300">Ir a la página de inicio</Link>
    </div>
    <PieLegal variante="compacto" />
  </div>
);

export default CuentaEliminadaPage;
