import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';
import { CheckCircleIcon } from '@/components/icons/Icon';

const PricingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      <nav className="h-20 border-b border-gray-800 flex items-center justify-between px-6 sm:px-12 bg-gray-950/80 backdrop-blur-md sticky top-0 z-[100]">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <Logo className="h-8 w-8 text-primary-500" />
          <span className="text-xl font-bold tracking-tighter italic">DEVFREELANCER</span>
        </div>
        <div className="flex items-center gap-6 relative z-[110]">
          <button 
            onClick={() => navigate('/login')}
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors py-2 px-4"
          >
            Entrar
          </button>
          <Button 
            variant="primary" 
            size="sm"
            onClick={() => navigate('/register')}
            className="hidden sm:block"
          >
            Empezar ahora
          </Button>
        </div>
      </nav>

      <main className="flex-1 py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-black mb-6 bg-gradient-to-r from-primary-400 to-purple-500 bg-clip-text text-transparent">
              Planes y Precios
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Elige el plan que mejor se adapte a tus necesidades como desarrollador freelance.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Plan Free */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col">
              <h3 className="text-2xl font-bold mb-2">Free</h3>
              <div className="text-4xl font-black mb-6">€0<span className="text-lg text-gray-500 font-normal">/mes</span></div>
              <p className="text-gray-400 mb-8">Para empezar a gestionar tus proyectos.</p>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>Hasta 3 proyectos</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>Facturación básica</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>10 créditos IA</span></li>
              </ul>
              <Button variant="secondary" className="w-full" onClick={() => navigate('/register')}>
                Empezar Gratis
              </Button>
            </div>

            {/* Plan Pro */}
            <div className="bg-gray-900 border-2 border-primary-500 rounded-2xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl shadow-primary-500/20">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-bold">
                MÁS POPULAR
              </div>
              <h3 className="text-2xl font-bold mb-2">Pro</h3>
              <div className="text-4xl font-black mb-6">€19<span className="text-lg text-gray-500 font-normal">/mes</span></div>
              <p className="text-gray-400 mb-8">Todo lo que necesitas para escalar tu negocio.</p>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>Proyectos ilimitados</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>IA Assistant Avanzado</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>Dashboard de métricas</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>Soporte prioritario</span></li>
              </ul>
              <Button variant="primary" className="w-full" onClick={() => navigate('/register?plan=pro')}>
                Probar Pro
              </Button>
            </div>

            {/* Plan Agency */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col">
              <h3 className="text-2xl font-bold mb-2">Agency</h3>
              <div className="text-4xl font-black mb-6">€49<span className="text-lg text-gray-500 font-normal">/mes</span></div>
              <p className="text-gray-400 mb-8">Para equipos y agencias en crecimiento.</p>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>Hasta 5 usuarios</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>Gestión de equipos</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>API Access</span></li>
                <li className="flex items-center gap-3"><CheckCircleIcon className="w-5 h-5 text-primary-500" /> <span>White-labeling</span></li>
              </ul>
              <Button variant="secondary" className="w-full" onClick={() => navigate('/register?plan=agency')}>
                Contactar Ventas
              </Button>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-12 px-6 border-t border-gray-800 bg-gray-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <Logo className="h-6 w-6 text-primary-500" />
            <span className="text-lg font-bold tracking-tighter italic">DEVFREELANCER</span>
          </div>
          <p className="text-gray-500 text-sm">
            © 2024 DevFreelancer. Todos los derechos reservados.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-gray-400 hover:text-white transition-colors">Términos</a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">Privacidad</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;
