
import React, { useState } from 'react';
import Modal from '../ui/Modal';
import { SparklesIcon, ZapIcon, CheckCircleIcon, StarIcon, RefreshCwIcon, ShieldIcon } from '../icons/Icon';
import { STRIPE_ITEMS, redirectToCheckout, StripeItemKey } from '../../services/stripeService';
import { useToast } from '../../hooks/useToast';

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BuyCreditsModal: React.FC<BuyCreditsModalProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handlePurchase = async (itemKey: StripeItemKey) => {
    setIsLoading(itemKey);
    try {
        await redirectToCheckout(itemKey);
    } catch (error) {
        addToast((error as Error).message, 'error');
        setIsLoading(null);
    }
  };

  const CreditCardItem: React.FC<{
    credits: number;
    price: string;
    itemKey: StripeItemKey;
    popular?: boolean;
    features: string[];
    color: string;
  }> = ({ credits, price, itemKey, popular, features, color }) => (
    <div className={`relative group flex flex-col p-5 rounded-2xl border transition-all duration-300 transform hover:-translate-y-1 ${
        popular 
        ? 'bg-gradient-to-b from-gray-800 to-gray-900 border-purple-500 shadow-2xl shadow-purple-500/20 z-10' 
        : 'bg-gray-900 border-gray-800 hover:border-gray-700 hover:shadow-xl'
    }`}>
        {popular && (
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-full text-center">
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-lg">
                    <StarIcon className="w-3 h-3 mr-1 fill-current" /> Mejor Valor
                </span>
            </div>
        )}
        
        <div className="text-center mb-4 mt-2">
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-800 mb-3 group-hover:scale-110 transition-transform duration-300 border border-gray-700`}>
                <SparklesIcon className={`w-6 h-6 ${color}`} />
            </div>
            <div className="flex flex-col items-center justify-center">
                <span className={`text-3xl font-extrabold text-white`}>
                    {credits}
                </span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Créditos</span>
            </div>
            <p className="text-xl font-bold text-white mt-2">{price}</p>
        </div>

        <ul className="space-y-2 mb-6 flex-1 px-2">
            {features.map((feat, i) => (
                <li key={i} className="flex items-start text-xs text-gray-400">
                    <CheckCircleIcon className="w-3 h-3 mr-2 text-green-500 shrink-0 mt-0.5" />
                    {feat}
                </li>
            ))}
        </ul>

        <button 
            onClick={() => handlePurchase(itemKey)} 
            disabled={!!isLoading}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all duration-200 shadow-lg flex items-center justify-center ${
                popular 
                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:shadow-purple-500/40' 
                : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'
            }`}
        >
            {isLoading === itemKey ? (
                <RefreshCwIcon className="w-4 h-4 animate-spin"/>
            ) : (
                <>
                    <ZapIcon className="w-4 h-4 mr-2" />
                    Recargar
                </>
            )}
        </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Necesitas más energía">
      <div className="space-y-6">
        <div className="text-center bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <p className="text-gray-300 text-sm">
                Has agotado tus créditos de IA. Para continuar utilizando las funciones de generación automática y análisis, selecciona un paquete de recarga.
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CreditCardItem 
                credits={100}
                price="1,95 €"
                itemKey="aiCredits100"
                color="text-blue-400"
                features={["~20 Propuestas", "Básico"]}
            />

            <CreditCardItem 
                credits={500}
                price="3,95 €"
                itemKey="aiCredits500"
                popular={true}
                color="text-purple-400"
                features={["~100 Propuestas", "Análisis Financiero", "Docs con IA"]}
            />

            <CreditCardItem 
                credits={1000}
                price="5,95 €"
                itemKey="aiCredits1000"
                color="text-yellow-400"
                features={["Uso intensivo", "Soporte Prioritario", "Para Equipos"]}
            />
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 pt-2">
            <ShieldIcon className="w-3 h-3" />
            <span>Pago seguro procesado por Stripe. Los créditos no caducan.</span>
        </div>
      </div>
    </Modal>
  );
};

export default BuyCreditsModal;
