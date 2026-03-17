import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-10 text-white">
          <Logo className="h-8 w-8" />
          <span className="text-2xl font-bold italic tracking-tighter">DEVFREELANCER</span>
        </div>

        <h1 className="text-4xl font-black text-white mb-8">Términos del Servicio</h1>
        
        <div className="space-y-6 text-sm leading-relaxed text-gray-400">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Aceptación de los Términos</h2>
            <p>Al acceder y utilizar DevFreelancer, usted acepta cumplir con estos términos. Nuestra plataforma proporciona herramientas de gestión para freelancers, incluyendo facturación y análisis de proyectos.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Uso de la Cuenta</h2>
            <p>Usted es responsable de mantener la seguridad de su cuenta iniciada mediante Google OAuth. DevFreelancer no se hace responsable de pérdidas resultantes del acceso no autorizado a su cuenta de Google.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Propiedad de los Datos</h2>
            <p>Usted conserva todos los derechos sobre los datos de sus clientes y proyectos. DevFreelancer no reclama propiedad sobre el contenido que usted genere en la plataforma.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Limitación de Responsabilidad</h2>
            <p>La herramienta de "Asistente IA" y "Cálculo de Impuestos" son ayudas informativas. No constituyen asesoría legal ni financiera profesional. Verifique siempre los resultados antes de presentar documentos oficiales.</p>
          </section>

          <div className="pt-8 border-t border-gray-800">
            <Link to="/" className="text-primary-400 hover:underline">Volver al inicio</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
