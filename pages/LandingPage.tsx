import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      {/* Barra de Navegación - Ajustada para máxima compatibilidad de clics */}
      <nav className="h-20 border-b border-gray-800 flex items-center justify-between px-6 sm:px-12 bg-gray-950/50 backdrop-blur-md sticky top-0 z-[100]">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 text-primary-500" />
          <span className="text-xl font-bold tracking-tighter italic">DEVFREELANCER</span>
        </div>
        
        {/* Contenedor de botones con z-index explícito */}
        <div className="flex items-center gap-4 relative z-[110]">
          <Link 
            to="/auth/login" 
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer py-2 px-3"
          >
            Entrar
          </Link>
          
          <Link to="/auth/register" className="cursor-pointer">
            <Button variant="primary" size="sm" className="pointer-events-none">
              Empezar ahora
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-20 px-6 max-w-5xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-black mb-8 bg-gradient-to-r from-primary-400 to-purple-500 bg-clip-text text-transparent leading-tight">
            Toma el control de tu carrera freelance
          </h1>
          <p className="text-gray-400 text-xl mb-12 max-w-3xl mx-auto leading-relaxed">
            DevFreelancer es la plataforma "todo en uno" para desarrolladores. Gestiona tus clientes, automatiza tus facturas con inteligencia artificial y analiza la rentabilidad de tus proyectos en un solo lugar seguro.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4 relative z-10">
            <Link to="/auth/register">
              <Button className="px-10 py-4 text-lg w-full sm:w-auto bg-primary-600 hover:bg-primary-700">
                Empezar ahora gratis
              </Button>
            </Link>
            <Link to="/auth/login">
              <Button variant="outline" className="px-10 py-4 text-lg w-full sm:w-auto border-gray-700 hover:bg-gray-800">
                Ver demo
              </Button>
            </Link>
          </div>
        </section>

        {/* Sección de Features */}
        <section className="py-20 bg-gray-900/20 border-y border-gray-800 px-6">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800">
              <span className="text-3xl mb-4 block">🤖</span>
              <h3 className="text-xl font-bold mb-3">IA para Freelancers</h3>
              <p className="text-gray-500 text-sm">Genera contratos y propuestas automáticamente.</p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800">
              <span className="text-3xl mb-4 block">💰</span>
              <h3 className="text-xl font-bold mb-3">Facturación Simple</h3>
              <p className="text-gray-500 text-sm">Gestiona cobros y facturas en segundos.</p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800">
              <span className="text-3xl mb-4 block">📊</span>
              <h3 className="text-xl font-bold mb-3">Métricas</h3>
              <p className="text-gray-500 text-sm">Visualiza tu rentabilidad real.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-800 py-16 px-6 bg-gray-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6 opacity-80" />
            <span className="text-lg font-bold italic">DEVFREELANCER</span>
          </div>
          <div className="flex gap-10">
            <Link to="/privacy" className="text-sm text-gray-500 hover:text-primary-400">Privacidad</Link>
            <Link to="/terms" className="text-sm text-gray-500 hover:text-primary-400">Términos</Link>
            <a href="mailto:soporte@devfreelancer.app" className="text-sm text-gray-500 hover:text-primary-400">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;