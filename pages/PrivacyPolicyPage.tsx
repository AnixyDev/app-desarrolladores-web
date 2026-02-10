import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-10">
          <Logo className="h-8 w-8 text-primary-500" />
          <span className="text-2xl font-bold text-white italic">DEVFREELANCER</span>
        </div>

        <h1 className="text-4xl font-black text-white mb-8">Política de Privacidad</h1>
        
        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Información que recopilamos</h2>
            <p>
              En DevFreelancer, recopilamos información necesaria para proporcionar nuestros servicios de gestión profesional. Esto incluye su nombre, dirección de correo electrónico y avatar, obtenidos a través de la autenticación de Google OAuth para crear y gestionar su cuenta de usuario.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Uso de los datos</h2>
            <p>
              Utilizamos sus datos únicamente para:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Identificarlo dentro de la plataforma.</li>
              <li>Personalizar sus facturas y propuestas comerciales.</li>
              <li>Sincronizar su actividad de gestión de proyectos y tiempos.</li>
              <li>Enviar notificaciones críticas sobre sus pagos o estado de cuenta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Autenticación de Google</h2>
            <p>
              Nuestra aplicación utiliza los servicios de Google OAuth para el inicio de sesión. No almacenamos sus contraseñas de Google. Al utilizar este servicio, nos autoriza a acceder a su información de perfil básica (nombre y correo electrónico) de acuerdo con los términos de privacidad de Google.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Protección de Datos</h2>
            <p>
              Implementamos medidas de seguridad técnicas como cifrado SSL y almacenamiento seguro a través de Supabase para proteger su información contra accesos no autorizados o pérdida de datos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Sus Derechos</h2>
            <p>
              Usted tiene derecho a acceder, rectificar o eliminar sus datos personales en cualquier momento a través de la sección de Ajustes en su panel de control o enviando un correo a soporte@devfreelancer.app.
            </p>
          </section>

          <section className="pt-8 border-t border-gray-800">
            <p className="text-xs text-gray-500">Última actualización: 10 de Febrero de 2026</p>
            <Link to="/" className="inline-block mt-6 text-primary-400 hover:underline">
              Volver al Inicio
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
