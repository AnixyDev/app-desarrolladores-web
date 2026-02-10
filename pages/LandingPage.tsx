import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  // Función para navegar de forma segura
  const goTo = (path: string) => {
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      {/* Barra de Navegación */}
      <nav className="h-20 border-b border-gray-800 flex items-center justify-between px-6 sm:px-12 bg-gray-950/80 backdrop-blur-md sticky top-0 z-[100]">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => goTo('/')}>
          <Logo className="h-8 w-8 text-primary-500" />
          <span className="text-xl font-bold tracking-tighter italic">DEVFREELANCER</span>
        </div>
        
        <div className="flex items-center gap-6 relative z-[110]">
          {/* Botón de Entrar - Convertido a button para asegurar el clic */}
          <button 
            onClick={() => goTo('/auth/login')}
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer py-2"
          >
            Entrar
          </button>
          
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => goTo('/auth/register')}
            className="hidden sm:block"
          >
            Empezar ahora
          </Button>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-24 px-6 max-w-5xl mx-auto text-center relative z-10">
          <h1 className="text-5xl md:text-7xl font-black mb-8 bg-gradient-to-r from-primary-400 to-purple-500 bg-clip-text text-transparent leading-tight">
            Toma el control de tu carrera freelance
          </h1>
          <p className="text-gray-400 text-xl mb-12 max-w-3xl mx-auto leading-relaxed">
            DevFreelancer es la plataforma "todo en uno" para desarrolladores. Gestiona tus clientes, automatiza tus facturas con inteligencia artificial y analiza la rentabilidad de tus proyectos.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button 
              onClick={() => goTo('/auth/register')}
              className="px-10 py-4 text-lg w-full sm:w-auto bg-primary-600 hover:bg-primary-700"
            >
              Empezar ahora gratis
            </Button>
            <Button 
              variant="outline" 
              onClick={() => goTo('/auth/login')}
              className="px-10 py-4 text-lg w-full sm:w-auto border-gray-700 hover:bg-gray-800"
            >
              Ver demo
            </Button>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 bg-gray-900/20 border-y border-gray-800 px-6">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-primary-500/50 transition-colors">
              <span className="text-3xl mb-4 block">🤖</span>
              <h3 className="text-xl font-bold mb-3 text-white">IA para Freelancers</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Genera contratos y propuestas personalizadas automáticamente con nuestra inteligencia artificial integrada.</p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-primary-500/50 transition-colors">
              <span className="text-3xl mb-4 block">💰</span>
              <h3 className="text-xl font-bold mb-3 text-white">Facturación Simple</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Controla tus ingresos, crea facturas profesionales y gestiona tus gastos sin complicaciones.</p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-primary-500/50 transition-colors">
              <span className="text-3xl mb-4 block">📊</span>
              <h3 className="text-xl font-bold mb-3 text-white">Métricas Reales</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Visualiza la rentabilidad de cada proyecto y cliente para saber dónde enfocar tus esfuerzos.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-800 py-12 px-6 bg-gray-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6 opacity-80 text-primary-500" />
            <span className="text-lg font-bold italic text-white">DEVFREELANCER</span>
          </div>
          <div className="flex gap-8">
            <button onClick={() => goTo('/privacy')} className="text-sm text-gray-500 hover:text-primary-400 transition-colors">Privacidad</button>
            <button onClick={() => goTo('/terms')} className="text-sm text-gray-500 hover:text-primary-400 transition-colors">Términos</button>
            <a href="mailto:soporte@devfreelancer.app" className="text-sm text-gray-500 hover:text-primary-400 transition-colors">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;