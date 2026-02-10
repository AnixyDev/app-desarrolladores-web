import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      {/* Barra de Navegación */}
      <nav className="h-20 border-b border-gray-800 flex items-center justify-between px-6 sm:px-12 bg-gray-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 text-primary-500" />
          <span className="text-xl font-bold tracking-tighter italic">DEVFREELANCER</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/auth/login" className="text-sm font-medium text-gray-400 hover:text-white transition">
            Entrar
          </Link>
          <Link to="/auth/register">
            <Button variant="primary" size="sm">Empezar ahora</Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section - Explicación del Propósito para Google */}
      <main className="flex-1">
        <section className="py-20 px-6 max-w-5xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-black mb-8 bg-gradient-to-r from-primary-400 to-purple-500 bg-clip-text text-transparent leading-tight">
            Toma el control de tu carrera freelance
          </h1>
          <p className="text-gray-400 text-xl mb-12 max-w-3xl mx-auto leading-relaxed">
            DevFreelancer es la plataforma "todo en uno" para desarrolladores. Gestiona tus clientes, automatiza tus facturas con inteligencia artificial y analiza la rentabilidad de tus proyectos en un solo lugar seguro.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
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

        {/* Grid de Funcionalidades */}
        <section className="py-20 bg-gray-900/20 border-y border-gray-800 px-6">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-primary-500/50 transition-colors">
              <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center mb-6">
                <span className="text-2xl">🤖</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">IA para Freelancers</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Genera automáticamente contratos, propuestas y descripciones de tareas utilizando nuestro asistente de IA integrado.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-green-500/50 transition-colors">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-6">
                <span className="text-2xl">💰</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Facturación Simple</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Crea facturas profesionales en segundos, gestiona cobros y mantén tus impuestos bajo control sin hojas de cálculo infinitas.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-6">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Métricas de Éxito</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Visualiza qué proyectos son los más rentables y cuánto estás ganando realmente por hora trabajada.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer - Enlaces Legales para Google */}
      <footer className="border-t border-gray-800 py-16 px-6 bg-gray-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-2">
              <Logo className="h-6 w-6 opacity-80" />
              <span className="text-lg font-bold tracking-tighter italic">DEVFREELANCER</span>
            </div>
            <p className="text-gray-600 text-xs max-w-xs text-center md:text-left">
              La plataforma de gestión diseñada por y para desarrolladores independientes.
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-10">
            <div className="flex flex-col gap-3">
              <span className="text-white font-bold text-sm uppercase tracking-widest">Legal</span>
              <Link to="/privacy" className="text-sm text-gray-500 hover:text-primary-400 transition">
                Política de Privacidad
              </Link>
              <Link to="/terms" className="text-sm text-gray-500 hover:text-primary-400 transition">
                Términos del Servicio
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-white font-bold text-sm uppercase tracking-widest">Soporte</span>
              <a href="mailto:soporte@devfreelancer.app" className="text-sm text-gray-500 hover:text-primary-400 transition">
                Contacto
              </a>
              <span className="text-sm text-gray-500">Centro de ayuda</span>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-16 pt-8 border-t border-gray-900 flex justify-center">
          <p className="text-gray-700 text-[10px] uppercase tracking-[0.2em]">
            © 2026 DevFreelancer Project. Hecho para la comunidad dev.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;