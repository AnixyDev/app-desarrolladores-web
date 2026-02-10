import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Navegación simple */}
      <nav className="h-20 border-b border-gray-800 flex items-center justify-between px-6 sm:px-12 bg-gray-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tighter italic">DEVFREELANCER</span>
        </div>
        <Link to="/auth/login">
          <Button variant="primary">Iniciar Sesión</Button>
        </Link>
      </nav>

      {/* Hero Section - AQUÍ SE EXPLICA EL PROPÓSITO (Punto 1) */}
      <main className="flex-1">
        <section className="py-20 px-6 max-w-5xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r from-primary-400 to-purple-500 bg-clip-text text-transparent">
            Gestión Inteligente para el Desarrollador Moderno
          </h1>
          <p className="text-gray-400 text-xl mb-10 max-w-3xl mx-auto">
            DevFreelancer es una plataforma integral diseñada para ayudar a desarrolladores independientes a organizar sus proyectos, automatizar facturas mediante IA y monitorizar su rentabilidad financiera en tiempo real.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/auth/register" className="w-full sm:w-auto">
  <Button className="px-8 py-4 text-lg w-full">
    Empezar ahora gratis
  </Button>
</Link>
          </div>
        </section>

        {/* Sección de Características - JUSTIFICACIÓN DE DATOS */}
        <section className="py-16 bg-gray-900/30 border-y border-gray-800 px-6">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800">
              <h3 className="text-xl font-bold mb-3 text-primary-400">Asistente de IA</h3>
              <p className="text-gray-400 text-sm">
                Utilizamos tu perfil profesional para generar propuestas comerciales y descripciones de tareas precisas, ahorrándote horas de redacción manual.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800">
              <h3 className="text-xl font-bold mb-3 text-green-400">Facturación Pro</h3>
              <p className="text-gray-400 text-sm">
                Crea, gestiona y envía facturas profesionales a tus clientes. Mantén un control estricto de tus ingresos y estados de pago.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800">
              <h3 className="text-xl font-bold mb-3 text-purple-400">Análisis de Datos</h3>
              <p className="text-gray-400 text-sm">
                Visualiza la rentabilidad de tus proyectos con gráficos avanzados. Entiende dónde inviertes tu tiempo y qué clientes son más rentables.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer - VÍNCULOS OBLIGATORIOS (Punto 4) */}
      <footer className="border-t border-gray-800 py-12 px-6 bg-gray-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Logo className="h-5 w-5" />
            <span className="text-sm font-bold tracking-tighter">DEVFREELANCER</span>
          </div>
          
          <div className="flex gap-8">
            <Link to="/privacy" className="text-sm text-gray-500 hover:text-primary-400 transition">
              Política de Privacidad
            </Link>
            <Link to="/terms" className="text-sm text-gray-500 hover:text-primary-400 transition">
              Términos del Servicio
            </Link>
            <a href="mailto:soporte@devfreelancer.app" className="text-sm text-gray-500 hover:text-primary-400 transition">
              Contacto
            </a>
          </div>

          <p className="text-gray-600 text-xs">
            © 2026 DevFreelancer. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
