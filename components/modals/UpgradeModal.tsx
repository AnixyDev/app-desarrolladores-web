import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { ZapIcon, CheckCircleIcon, RefreshCwIcon } from '../icons/Icon';
import { redirectToCheckout } from '@/services/stripeService';
import { precioDe } from '../../supabase/functions/_shared/catalogo-stripe';
import { useToast } from '@/hooks/useToast';

/**
 * Modal de conversión a Teams.
 *
 * Lo abren OCHO páginas distintas (Clientes, Marketplace, Detalle de oferta,
 * Publicar oferta, Mis candidaturas, Ofertas guardadas, Perfil público): es lo
 * que ve un usuario Free justo cuando topa con un límite y decide pagar.
 *
 * DOS FALLOS QUE TENÍA:
 *
 * 1. El botón "Confirmar y Pagar" hacía
 *    `alert("¡Redirigiendo a pago! (Simulación)")`. En producción. El embudo
 *    de conversión entero terminaba en una ventana del navegador con la
 *    palabra "Simulación" — no había checkout ni Stripe por ningún lado.
 *
 * 2. Anunciaba 35,95 €, el precio de Teams ANTES de la subida de agosto de
 *    2026. La subida se aplicó en PricingPage y en BillingPage y este modal se
 *    quedó atrás, así que enseñaba un precio y Stripe cobraba otro (45,95 €).
 *
 * Ahora cobra de verdad, y el precio sale del catálogo compartido — el mismo
 * archivo que guarda el priceId con el que Stripe cobra.
 */

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const tarifa = precioDe('teamsPlan');

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      await redirectToCheckout('teamsPlan');
      // Si todo va bien el navegador se va a Stripe y esto ya no se ejecuta.
    } catch (error) {
      addToast((error as Error).message || 'No se pudo abrir la pasarela de pago.', 'error');
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Actualizar a DevFreelancer Teams">
      <div className="space-y-4">
        <div className="text-center p-4 bg-gray-800 rounded-lg">
          <ZapIcon className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">¡Desbloquea el poder del trabajo en equipo!</p>
          {tarifa && (
            <p className="text-gray-400">
              Pasa a Teams por{' '}
              <span className="text-white font-bold">{tarifa.precio}</span>
              {tarifa.periodo ? ` al ${tarifa.periodo}` : ''}.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="flex items-start gap-2"><CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /><span>Invita hasta 5 miembros y asigna roles.</span></p>
          <p className="flex items-start gap-2"><CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /><span>Centraliza la base de conocimiento.</span></p>
          <p className="flex items-start gap-2"><CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /><span>Automatiza flujos con Webhooks.</span></p>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Pago seguro procesado por Stripe. Puedes cancelar cuando quieras desde Facturación.
        </p>

        <div className="pt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>Quizás más tarde</Button>
          <Button onClick={handleUpgrade} disabled={isLoading}>
            {isLoading ? (
              <><RefreshCwIcon className="w-4 h-4 mr-2 animate-spin" /> Abriendo pago seguro…</>
            ) : (
              'Confirmar y Pagar'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UpgradeModal;
