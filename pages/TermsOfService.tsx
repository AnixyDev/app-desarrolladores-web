import React from 'react';
import { Link } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import { Logo } from '../components/icons/Logo';

const TermsOfService: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center p-4 sm:p-8">
             <div className="flex items-center mb-8">
                <Logo className="h-10 w-10 mr-3" />
                <span className="text-3xl font-bold text-white tracking-tighter">DevFreelancer</span>
            </div>
            <Card className="w-full max-w-4xl border-gray-800 shadow-2xl">
                <CardHeader className="border-b border-gray-800 p-8">
                    <h1 className="text-3xl font-extrabold text-white">Condiciones de Servicio</h1>
                    <p className="text-gray-400 mt-2 text-sm italic">Última revisión: 25 de mayo de 2024</p>
                </CardHeader>
                <CardContent className="prose prose-invert max-w-none text-gray-300 p-8 space-y-6 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">1. Aceptación de los Términos</h2>
                        <p>
                            Al acceder y utilizar DevFreelancer.app ("la Plataforma"), usted acepta cumplir y estar sujeto a las presentes Condiciones de Servicio. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestros servicios.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">2. Descripción del Servicio</h2>
                        <p>
                            DevFreelancer es una plataforma SaaS diseñada para facilitar la gestión de clientes, proyectos, facturación y análisis de negocio para profesionales independientes. Incluye funciones potenciadas por Inteligencia Artificial para la optimización de flujos de trabajo.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">3. Suscripciones y Pagos</h2>
                        <p>
                            La Plataforma utiliza <strong>Stripe</strong> como proveedor de servicios de pago seguro. 
                        </p>
                        <ul className="list-disc list-inside ml-4 space-y-2 mt-2 text-sm">
                            <li>Los planes se facturan por adelantado de forma mensual o anual.</li>
                            <li>Usted es responsable de proporcionar información de pago válida y actualizada.</li>
                            <li>Las cancelaciones de suscripción surtirán efecto al final del periodo de facturación actual.</li>
                            <li>No se ofrecen reembolsos por periodos de servicio parcialmente utilizados, salvo que la ley exija lo contrario.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">4. Propiedad Intelectual</h2>
                        <p>
                            <strong>Sus Datos:</strong> Usted conserva todos los derechos de propiedad intelectual sobre el contenido que introduce en la plataforma (datos de clientes, facturas, proyectos). DevFreelancer no reclama propiedad alguna sobre su información de negocio.
                        </p>
                        <p className="mt-2">
                            <strong>Nuestra Plataforma:</strong> Todo el software, diseño, logotipos y algoritmos de IA son propiedad exclusiva de DevFreelancer o sus licenciantes y están protegidos por leyes de propiedad intelectual internacionales.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">5. Limitación de Responsabilidad</h2>
                        <p>
                            DevFreelancer se proporciona "tal cual". No garantizamos que el servicio sea ininterrumpido o libre de errores. En ningún caso seremos responsables de pérdidas de beneficios, datos o daños indirectos derivados del uso o la imposibilidad de uso de la plataforma.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-4 mb-4">6. Modificaciones</h2>
                        <p>
                            Nos reservamos el derecho de modificar estos términos en cualquier momento. Notificaremos cambios significativos a través de la propia plataforma o por correo electrónico. El uso continuado tras dichos cambios implica la aceptación de los nuevos términos.
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

export default TermsOfService;