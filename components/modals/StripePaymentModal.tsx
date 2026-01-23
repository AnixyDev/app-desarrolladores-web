import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe, createPaymentIntent } from '../../services/stripeService';
import { useAppStore } from '../../hooks/useAppStore';
import Button from '../ui/Button';
import { formatCurrency } from '../../lib/utils';
import { RefreshCwIcon, AlertTriangleIcon } from '../icons/Icon';

interface StripePaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amountCents: number;
    description: string;
    itemKey?: string;
    metadata?: Record<string, any>;
    onPaymentSuccess: () => void;
}

const CheckoutForm: React.FC<{ amount: number; onSuccess: () => void }> = ({ amount, onSuccess }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);

        // Se especifica una URL de retorno limpia sin hashfragments.
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/billing?payment=success`,
            },
            redirect: 'if_required'
        });

        if (error) {
            setMessage(error.message || "Ocurrió un error inesperado.");
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            setMessage(null);
            onSuccess();
        } else {
            setMessage("El estado del pago es incierto. Por favor revisa tu consola.");
        }

        setIsLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <PaymentElement />
            {message && (
                <div className="bg-red-500/10 border border-red-500 text-red-400 p-3 rounded text-sm flex items-center">
                    <AlertTriangleIcon className="w-4 h-4 mr-2"/> {message}
                </div>
            )}
            <Button type="submit" disabled={isLoading || !stripe || !elements} className="w-full">
                {isLoading ? <RefreshCwIcon className="w-4 h-4 animate-spin mr-2"/> : null}
                {isLoading ? 'Procesando...' : `Pagar ${formatCurrency(amount)}`}
            </Button>
        </form>
    );
};

const StripePaymentModal: React.FC<StripePaymentModalProps> = ({ isOpen, onClose, amountCents, description, itemKey = 'invoicePayment', metadata, onPaymentSuccess }) => {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const { profile } = useAppStore();

    useEffect(() => {
        if (isOpen && amountCents > 0) {
            const initializePayment = async () => {
                if (!profile?.id) {
                    setInitError("Debes iniciar sesión para realizar un pago.");
                    return;
                }

                try {
                    setInitError(null);
                    setClientSecret(null);
                    
                    const secret = await createPaymentIntent(
                        amountCents, 
                        profile.id, 
                        itemKey, 
                        metadata || {}
                    );
                    
                    setClientSecret(secret);
                } catch (error: any) {
                    console.error("Stripe initialization error:", error);
                    setInitError(error.message || "Error al conectar con la pasarela de pago segura.");
                }
            };
            initializePayment();
        }
    }, [isOpen, amountCents, profile?.id, itemKey, metadata]);

    const handleSuccess = () => {
        onPaymentSuccess();
        setTimeout(() => {
            onClose();
        }, 2000);
    };

    const stripePromise = getStripe();

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Pago Seguro con Tarjeta">
            <div className="space-y-4">
                <div className="bg-gray-800 p-4 rounded-lg flex justify-between items-center border border-gray-700">
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase font-semibold">Concepto</span>
                        <span className="text-gray-200">{description}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-gray-400 text-xs uppercase font-semibold block">Importe</span>
                        <span className="text-xl font-bold text-white">{formatCurrency(amountCents)}</span>
                    </div>
                </div>

                {initError && (
                    <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg text-red-400 text-center text-sm flex items-center justify-center">
                        <AlertTriangleIcon className="w-4 h-4 mr-2" />
                        {initError}
                    </div>
                )}

                {clientSecret ? (
                    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#d946ef' } } }}>
                        <CheckoutForm amount={amountCents} onSuccess={handleSuccess} />
                    </Elements>
                ) : !initError ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3">
                        <RefreshCwIcon className="w-8 h-8 text-primary-500 animate-spin" />
                        <p className="text-gray-500 text-sm animate-pulse">Cargando pasarela segura...</p>
                    </div>
                ) : null}
            </div>
        </Modal>
    );
};

export default StripePaymentModal;