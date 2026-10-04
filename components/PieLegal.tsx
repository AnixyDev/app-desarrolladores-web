// Enlaces legales comunes a todas las páginas (LSSI art. 10: el aviso legal
// debe estar accesible de forma permanente y fácil).
//
// - "completo": pie de las páginas públicas (home, precios, páginas legales).
// - "compacto": una línea de enlaces pequeños (login, pago de factura, portal,
//   dentro de la app).
import React from 'react';
import { Link } from 'react-router-dom';

export const ENLACES_LEGALES = [
  { to: '/aviso-legal', texto: 'Aviso legal' },
  { to: '/privacidad', texto: 'Privacidad' },
  { to: '/cookies', texto: 'Cookies' },
  { to: '/terms', texto: 'Términos' },
] as const;

interface Props {
  variante?: 'completo' | 'compacto';
  className?: string;
}

const PieLegal: React.FC<Props> = ({ variante = 'completo', className = '' }) => {
  if (variante === 'compacto') {
    return (
      <nav aria-label="Información legal" className={`flex flex-wrap justify-center gap-x-4 gap-y-0 text-xs text-gray-500 ${className}`}>
        {ENLACES_LEGALES.map((e) => (
          <Link key={e.to} to={e.to} className="inline-block py-2 hover:text-gray-300 hover:underline">
            {e.texto}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <footer className={`border-t border-gray-900 py-8 px-6 text-sm text-gray-500 ${className}`}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} DevFreelancer</p>
        <nav aria-label="Información legal" className="flex flex-wrap justify-center gap-x-6 gap-y-0">
          {ENLACES_LEGALES.map((e) => (
            <Link key={e.to} to={e.to} className="inline-block py-2 hover:text-primary-400 transition-colors">
              {e.texto}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
};

export default PieLegal;
