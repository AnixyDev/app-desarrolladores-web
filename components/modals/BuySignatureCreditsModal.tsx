// components/modals/BuySignatureCreditsModal.tsx
//
// Ítem 5 del roadmap de monetización. Mismo patrón que BuyCreditsModal.tsx
// (créditos de IA): paquetes de pago único, no caducan, se consumen uno a
// uno al enviar un contrato a firmar. Precios de ejemplo — ajústalos en
// Stripe y en STRIPE_ITEMS (stripeService.ts) a lo que decidas cobrar.
import React, { useState } from 'react';
import Modal from '../ui/Modal';
import { FileSignatureIcon, ZapIcon, CheckCircleIcon, StarIcon, RefreshCwIcon, ShieldIcon } from '../icons/Icon';
import { STRIPE_ITEMS, redirectToCheckout, StripeItemKey } from '@/services/stripeService';
import { useToast } from '@/hooks/useToast';

interface BuySignatureCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BuySignatureCreditsModal: React.FC<BuySignatureCreditsModalProps> = ({ isOpen, onClose }) => {
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
    color: string;
  }> = ({ credits, price, itemKey, popular, color }) => (
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
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-800 mb-3 group-hover:scale-110 transition-transform duration-300 border border-gray-700">
                <FileSignatureIcon className={`w-6 h-6 ${color}`} />
            </div>
            <div className="flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-white">{credits}</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Firmas</span>
            </div>
            <p className="text-xl font-bold text-white mt-2">{price}</p>
        </div>

        <button
            onClick={() => handlePurchase(itemKey)}
            disabled={!!isLoading}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all duration-200 shadow-lg flex items-center justify-center ${
                popular
                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:shadow-purple-500/40'
                : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'
            }`}
        >
            {isLoading === itemKey ? <RefreshCwIcon className="w-4 h-4 animate-spin"/> : (
                <><ZapIcon className="w-4 h-4 mr-2" /> Comprar</>
            )}
        </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Créditos de firma electrónica">
      <div className="space-y-6">
        <div className="text-center bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <p className="text-gray-300 text-sm">
                Cada firma electrónica con validez legal (eIDAS) consume 1 crédito. Los créditos no caducan.
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CreditCardItem credits={5} price="3,95 €" itemKey="signatureCredits5" color="text-blue-400" />
            <CreditCardItem credits={10} price="6,95 €" itemKey="signatureCredits10" popular color="text-purple-400" />
            <CreditCardItem credits={25} price="14,95 €" itemKey="signatureCredits25" color="text-yellow-400" />
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 pt-2">
            <ShieldIcon className="w-3 h-3" />
            <span>Pago seguro procesado por Stripe. Los créditos no caducan.</span>
        </div>
      </div>
    </Modal>
  );
};

export default BuySignatureCreditsModal;
