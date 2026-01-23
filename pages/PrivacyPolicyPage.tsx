import React from 'react';
import { Link } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import { Logo } from '../components/icons/Logo';

const PrivacyPolicyPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center p-4 sm:p-8">
             <div className="flex items-center mb-8">
                <Logo className="h-10 w-10 mr-3" />
                <span className="text-3xl font-bold text-white tracking-tighter">DevFreelancer</span>
            </div>
            <Card className="w-full max-w-4xl border-gray-800 shadow-2xl">
                <CardHeader className="border-b border-gray-800 p-8">
                    <h1 className="text-3xl font-extrabold text-white">Política de Privacidad</h1>
                    <p className="text-gray-400 mt-2 text-sm italic">Última actualización: 25 de mayo de 2024</p>
                </CardHeader>
                <CardContent className="prose prose-invert max-w-none text-gray-300 p-8 space-y-6 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">1. Compromiso de Privacidad</h2>
                        <p>
                            En DevFreelancer ("nosotros", "nuestro"), la privacidad de sus datos de negocio es nuestra máxima prioridad. Esta política detalla cómo recopilamos, protegemos y utilizamos su información.
                        </p>
                    </section>
                    
                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">2. Gestión de Datos con Supabase</h2>
                        <p>
                            Utilizamos <strong>Supabase</strong> para el almacenamiento de datos y la autenticación. Sus datos se almacenan en servidores seguros y están protegidos mediante:
                        </p>
                        <ul className="list-disc list-inside ml-4 space-y-2 mt-2 text-sm">
                            <li>Encriptación de datos en reposo y en tránsito (SSL/TLS).</li>
                            <li>Políticas de Seguridad a Nivel de Fila (RLS) que aseguran que solo usted pueda acceder a sus registros.</li>
                            <li>Autenticación de doble factor opcional para su cuenta.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">3. Procesamiento de Pagos Seguro</h2>
                        <p>
                            La gestión de pagos se realiza íntegramente a través de <strong>Stripe</strong>. DevFreelancer <strong>no almacena</strong> los números de su tarjeta de crédito ni sus datos bancarios en nuestros servidores. Stripe cumple con el estándar de seguridad PCI-DSS Nivel 1.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">4. Cookies y Sesiones</h2>
                        <p>
                            Utilizamos cookies estrictamente necesarias para el funcionamiento del servicio:
                        </p>
                        <ul className="list-disc list-inside ml-4 space-y-2 mt-2 text-sm">
                            <li><strong>Token de Autenticación:</strong> Para mantener su sesión iniciada de forma segura.</li>
                            <li><strong>Preferencias Locales:</strong> Para recordar ajustes de interfaz (como el modo oscuro).</li>
                        </ul>
                        <p className="mt-2 text-xs text-gray-500">
                            No utilizamos cookies de seguimiento de terceros para fines publicitarios.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">5. Sus Derechos</h2>
                        <p>
                            Bajo el RGPD y otras normativas de privacidad, usted tiene derecho a:
                        </p>
                        <ul className="list-disc list-inside ml-4 space-y-2 mt-2 text-sm">
                            <li>Acceder, rectificar o eliminar sus datos personales en cualquier momento desde el panel de ajustes.</li>
                            <li>Solicitar la exportación de sus datos en formato legible.</li>
                            <li>Retirar su consentimiento para el tratamiento de datos mediante el cierre de su cuenta.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">6. Contacto DPO</h2>
                        <p>
                            Para cualquier consulta relacionada con sus datos, puede contactar con nuestro responsable de protección de datos en: 
                            <a href="mailto:privacy@devfreelancer.app" className="text-primary-400 ml-1">privacy@devfreelancer.app</a>.
                        </p>
                    </section>

                    <div className="text-center mt-12 pt-8 border-t border-gray-800">
                        <Link to="/" className="inline-flex items-center text-primary-400 hover:text-primary-300 font-bold transition-colors">
                            <span className="mr-2">←</span> Volver a la aplicación
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PrivacyPolicyPage;