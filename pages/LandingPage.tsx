import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';

const LandingPage: React.FC = () => {
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
            onClick={() => navigate('/auth/login')}
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors py-2 px-4"
          >
            Entrar
          </button>
          
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => navigate('/auth/register')}
            className="hidden sm:block"
          >
            Empezar ahora
          </Button>
        </div>
      </nav>

      <main className="flex-1">
        <section className="py-24 px-6 max-w-5xl mx-auto text-center relative z-10">
          <h1 className="text-5xl md:text-7xl font-black mb-8 bg-gradient-to-r from-primary-400 to-purple-500 bg-clip-text text-transparent leading-tight">
            Toma el control de tu carrera freelance
          </h1>
          <p className="text-gray-400 text-xl mb-12 max-w-3xl mx-auto">
            La plataforma definitiva para desarrolladores independientes.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button onClick={() => navigate('/auth/register')} className="px-10 py-4 text-lg bg-primary-600 hover:bg-primary-700">
              Empezar ahora gratis
            </Button>
            <Button variant="secondary" onClick={() => navigate('/auth/login')} className="px-10 py-4 text-lg border-gray-700 hover:bg-gray-800">
              Ver demo
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;