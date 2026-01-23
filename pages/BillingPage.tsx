import React, { useState, useEffect } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import { CheckCircleIcon, CreditCard, Users, RefreshCwIcon, SettingsIcon } from '../components/icons/Icon';
import { redirectToCheckout, redirectToCustomerPortal, StripeItemKey } from '../services/stripeService';
import { useToast } from '../hooks/useToast';

const BillingPage: React.FC = () => {
    const { profile } = useAppStore();
    const { addToast } = useToast();
    const [isLoadingPage, setIsLoadingPage] = useState(true);
    const [isLoadingAction, setIsLoadingAction] = useState<string | null>(null);
    const [isPortalLoading, setIsPortalLoading] = useState(false);
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

    useEffect(() => {
        const timer = setTimeout(() => setIsLoadingPage(false), 600);
        return () => clearTimeout(timer);
    }, []);

    const handlePurchase = async (itemKey: StripeItemKey) => {
        setIsLoadingAction(itemKey);
        try {
            await redirectToCheckout(itemKey);
        } catch (error: any) {
            addToast(error.message || 'Error al conectar con Stripe. Revisa tu conexión.', 'error');
            setIsLoadingAction(null);
        }
    };

    const handleOpenPortal = async () => {
        setIsPortalLoading(true);
        try {
            await redirectToCustomerPortal();
        } catch (error: any) {
            addToast('No se pudo abrir el portal de facturación en este momento.', 'error');
            setIsPortalLoading(false);
        }
    };

    const isPro = profile.plan === 'Pro';
    const isTeams = profile.plan === 'Teams';

    const SubscriptionCard = ({ plan, title, price, period, features, isCurrent, itemKey, icon: Icon, recommended }: any) => (
        <div className={`relative flex flex-col p-6 sm:p-8 bg-gray-900 rounded-3xl border transition-all duration-300 ${isCurrent ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-gray-800 hover:border-gray-700 hover:shadow-2xl shadow-black'}`}>
            {recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-primary-600 to-purple-600 text-white shadow-lg shadow-primary-500/20">Más Popular</span>
                </div>
            )}
            <div className="mb-8">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${isCurrent ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30' : 'bg-gray-800 text-gray-400'}`}>
                    <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold text-white tracking-tight">{title}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white tracking-tighter">{price}</span>
                    <span className="text-sm text-gray-500 font-medium">/{period}</span>
                </div>
            </div>
            <ul className="flex-1 space-y-4 mb-10">
                {features.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-400 group">
                        <CheckCircleIcon className={`w-5 h-5 shrink-0 transition-colors ${isCurrent ? 'text-primary-400' : 'text-gray-600 group-hover:text-green-500'}`} />
                        <span className="leading-tight">{f}</span>
                    </li>
                ))}
            </ul>
            <Button 
                onClick={() => handlePurchase(itemKey)} 
                disabled={!!isLoadingAction || isCurrent} 
                className={`w-full h-12 rounded-xl text-sm font-bold transition-all ${isCurrent ? 'bg-gray-800 text-gray-500 cursor-default opacity-50' : recommended ? 'bg-white text-black hover:scale-[1.02] active:scale-[0.98]' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
                {isLoadingAction === itemKey ? <RefreshCwIcon className="w-5 h-5 animate-spin mx-auto"/> : isCurrent ? 'Plan Actual' : 'Seleccionar Plan'}
            </Button>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto space-y-12 pb-16 px-4">
            <div className="text-center space-y-6 pt-4">
                <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">Precios Transparentes</h1>
                <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">Invierte en las herramientas que hacen crecer tu negocio. Cancela cuando quieras.</p>
                
                <div className="inline-flex p-1 bg-gray-900 border border-gray-800 rounded-2xl shadow-inner">
                    <button onClick={() => setBillingCycle('monthly')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${billingCycle === 'monthly' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Mensual</button>
                    <button onClick={() => setBillingCycle('yearly')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${billingCycle === 'yearly' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Anual <span className="bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-lg border border-green-500/30">-20%</span></button>
                </div>
            </div>

            {(isPro || isTeams) && (
                <div className="flex justify-center">
                    <button 
                        onClick={handleOpenPortal} 
                        disabled={isPortalLoading} 
                        className="flex items-center gap-2 px-6 py-3 rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition-all text-sm font-semibold shadow-xl"
                    >
                        {isPortalLoading ? <RefreshCwIcon className="w-4 h-4 animate-spin"/> : <SettingsIcon className="w-4 h-4 text-primary-400"/>}
                        Configurar suscripción y métodos de pago
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
                {isLoadingPage ? (
                    [1, 2].map(i => <Skeleton key={i} variant="rect" className="h-[500px] w-full rounded-3xl" />)
                ) : (
                    <>
                        <SubscriptionCard
                            plan="Pro" title="Freelancer Pro" price="3,95€" period="mes"
                            features={["Proyectos e Hitos ilimitados", "Facturación AEAT (TicketBAI ready)", "Canal de chat privado por proyecto", "50 Créditos IA mensuales"]}
                            isCurrent={isPro} itemKey="proPlan" icon={CreditCard}
                        />
                        <SubscriptionCard
                            plan="Teams" title="Studio Team" recommended={true}
                            price={billingCycle === 'monthly' ? "35,95€" : "29,95€"}
                            period={billingCycle === 'monthly' ? "mes" : "mes (anual)"}
                            features={["Hasta 5 miembros de equipo", "Roles y permisos avanzados", "Integraciones con Slack y Webhooks", "200 Créditos IA compartidos"]}
                            isCurrent={isTeams} itemKey={billingCycle === 'monthly' ? 'teamsPlan' : 'teamsPlanYearly'} icon={Users}
                        />
                    </>
                )}
            </div>

            <div className="max-w-3xl mx-auto pt-12">
                <Card className="bg-gradient-to-br from-gray-900 to-gray-950 border-gray-800">
                    <CardContent className="p-8 text-center sm:text-left flex flex-col sm:flex-row items-center gap-8">
                        <div className="w-16 h-16 bg-primary-500/10 rounded-full flex items-center justify-center shrink-0">
                            <SettingsIcon className="w-8 h-8 text-primary-500" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-xl font-bold text-white">¿Necesitas un plan personalizado?</h4>
                            <p className="text-gray-400 text-sm">Si eres una agencia de más de 20 personas, ofrecemos despliegues en infraestructura privada (On-Premise) y soporte dedicado.</p>
                            <button className="text-primary-400 text-sm font-bold hover:underline mt-2">Hablar con ventas →</button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default BillingPage;