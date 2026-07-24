// pages/PricingPage.tsx
// FIX: esta página pública mostraba precios y planes completamente
// inventados (Free/€0, Pro/€19, Agency/€49, con features como "API Access"
// o "White-labeling" que no existen) frente a los precios REALES que
// ofrece /billing (Freelancer Pro 3,95€, Studio Team 35,95€/295€ anual).
// Un visitante podía ver un precio aquí y que le cobraran otro distinto al
// registrarse — directamente engañoso. Ahora usa el mismo diseño, los
// mismos textos y los mismos precios reales que /billing, con las mismas
// comprobaciones que evitan volver a desincronizarse: los límites del plan
// Free que se muestran aquí son los que de verdad aplica el código (1
// cliente — no "3 proyectos", que nunca estuvo implementado).
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';
import { CheckCircleIcon, CreditCard, Users, SettingsIcon } from '@/components/icons/Icon';

const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const PlanCard = ({
    title, price, period, priceNote, description, features, recommended, ctaLabel, onCta, icon: Icon,
  }: {
    title: string; price: string; period: string; priceNote?: string; description: string;
    features: string[]; recommended?: boolean; ctaLabel: string; onCta: () => void; icon: any;
  }) => (
    <div className={`relative flex flex-col p-6 sm:p-8 bg-gray-900 rounded-3xl border transition-all duration-300 ${recommended ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-gray-800 hover:border-gray-700'}`}>
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-primary-600 to-purple-600 text-white shadow-lg shadow-primary-500/20">Más Popular</span>
        </div>
      )}
      <div className="mb-8">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${recommended ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30' : 'bg-gray-800 text-gray-400'}`}>
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="text-2xl font-bold text-white tracking-tight">{title}</h3>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-4xl font-black text-white tracking-tighter">{price}</span>
          <span className="text-sm text-gray-500 font-medium">/{period}</span>
        </div>
        {priceNote && <p className="text-xs text-gray-500 mt-1">{priceNote}</p>}
        <p className="text-gray-400 mt-4 text-sm">{description}</p>
      </div>
      <ul className="flex-1 space-y-4 mb-10">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-gray-400">
            <CheckCircleIcon className="w-5 h-5 shrink-0 text-gray-600" />
            <span className="leading-tight">{f}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={onCta}
        className={`w-full h-12 rounded-xl text-sm font-bold transition-all ${recommended ? '!bg-white !text-black hover:scale-[1.02] active:scale-[0.98]' : 'bg-gray-800 hover:bg-gray-700'}`}
      >
        {ctaLabel}
      </Button>
    </div>
  );

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
          <Button variant="primary" size="sm" onClick={() => navigate('/auth/register')} className="hidden sm:block">
            Empezar ahora
          </Button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto space-y-12 pb-16 px-6">
        <div className="text-center space-y-6 pt-16">
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">Precios Transparentes</h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">Invierte en las herramientas que hacen crecer tu negocio. Cancela cuando quieras.</p>

          <div className="inline-flex p-1 bg-gray-900 border border-gray-800 rounded-2xl shadow-inner">
            <button onClick={() => setBillingCycle('monthly')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${billingCycle === 'monthly' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Mensual</button>
            <button onClick={() => setBillingCycle('yearly')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${billingCycle === 'yearly' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Anual <span className="bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-lg border border-green-500/30">-20%</span></button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
          <PlanCard
            title="Free"
            price="0€"
            period="mes"
            description="Para empezar a gestionar tu primer cliente."
            features={["1 cliente", "Facturación básica", "10 créditos IA"]}
            ctaLabel="Empezar Gratis"
            onCta={() => navigate('/auth/register')}
            icon={CheckCircleIcon}
          />
          <PlanCard
            title="Freelancer Pro"
            price="3,95€"
            period="mes"
            priceNote={billingCycle === 'yearly' ? 'Este plan solo está disponible con facturación mensual.' : undefined}
            description="Todo lo que necesitas para escalar tu negocio."
            features={["Proyectos e Hitos ilimitados", "Facturación AEAT (TicketBAI ready)", "Canal de chat privado por proyecto", "50 Créditos IA mensuales"]}
            ctaLabel="Empezar con Pro"
            onCta={() => navigate('/auth/register')}
            icon={CreditCard}
          />
          <PlanCard
            title="Studio Team"
            price={billingCycle === 'monthly' ? '35,95€' : '295€'}
            period={billingCycle === 'monthly' ? 'mes' : 'año'}
            recommended
            description="Para equipos y agencias en crecimiento."
            features={["Hasta 5 miembros de equipo", "Roles y permisos avanzados", "Integraciones con Slack y Webhooks", "200 Créditos IA compartidos"]}
            ctaLabel="Empezar con Team"
            onCta={() => navigate('/auth/register')}
            icon={Users}
          />
        </div>

        <div className="max-w-3xl mx-auto pt-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl">
            <div className="p-8 text-center sm:text-left flex flex-col sm:flex-row items-center gap-8">
              <div className="w-16 h-16 bg-primary-500/10 rounded-full flex items-center justify-center shrink-0">
                <SettingsIcon className="w-8 h-8 text-primary-500" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-white">¿Necesitas un plan personalizado?</h4>
                <p className="text-gray-400 text-sm">Si eres una agencia de más de 20 personas, ofrecemos despliegues en infraestructura privada (On-Premise) y soporte dedicado.</p>
                <a href="mailto:anixydev@gmail.com" className="text-primary-400 text-sm font-bold hover:underline mt-2 inline-block">Hablar con ventas →</a>
              </div>
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
            © {new Date().getFullYear()} DevFreelancer. Todos los derechos reservados.
          </p>
          <div className="flex gap-6">
            <Link to="/terms" className="text-gray-400 hover:text-white transition-colors">Términos</Link>
            <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors">Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;