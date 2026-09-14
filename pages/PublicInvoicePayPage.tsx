// pages/PublicInvoicePayPage.tsx
//
// Antes, la única forma de que un cliente pagara una factura era logueado
// en el portal de cliente (/portal/invoices/:id) — pero DevFreelancer es
// una app PARA FREELANCERS, no para sus clientes; pedirles que "se
// registren" solo para pagar una factura suelta era fricción innecesaria
// y no tenía sentido de producto. Esta página es pública: el UUID de la
// factura en la URL hace de contraseña (igual que un enlace de pago o una
// factura hospedada de Stripe), sin exigir ninguna cuenta.
//
// Usa la Edge Function get-public-invoice (sin auth, solo devuelve el
// subconjunto de datos necesario para pagar) y reutiliza StripePaymentModal,
// que ya soporta pagos sin sesión.

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';
import { CheckCircleIcon } from '@/components/icons/Icon';
import { formatCurrency } from '@/lib/utils';

const StripePaymentModal = lazy(() => import('@/components/modals/StripePaymentModal'));

interface PublicInvoiceItem {
  description: string;
  quantity: number;
  price_cents: number;
}

interface PublicInvoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  items: PublicInvoiceItem[];
  subtotal_cents: number;
  tax_percent: number;
  total_cents: number;
  paid: boolean;
  paid_cents: number;
  remaining_cents: number;
  business_name: string;
  brand_color: string | null;
  client_name: string | null;
}

const PublicInvoicePayPage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  useEffect(() => {
    if (!invoiceId) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('get-public-invoice', {
        body: { invoice_id: invoiceId },
      });

      if (error || !data || data.error) {
        setNotFound(true);
      } else {
        setInvoice(data as PublicInvoice);
      }
      setLoading(false);
    };

    load();
  }, [invoiceId]);

  const handlePaymentSuccess = () => {
    setInvoice(prev => prev ? { ...prev, paid: true, remaining_cents: 0, paid_cents: prev.total_cents } : prev);
  };

  const brandColor = invoice?.brand_color || '#d946ef';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (notFound || !invoice) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center p-6">
        <Logo className="h-8 w-8 text-primary-500 mb-4" />
        <p className="text-red-400 font-semibold">Factura no encontrada.</p>
        <p className="text-gray-500 text-sm mt-2">Comprueba que el enlace esté completo y sea correcto.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 py-4 px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: brandColor }}
          >
            {invoice.business_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-white leading-tight">{invoice.business_name}</p>
            <p className="text-xs text-gray-500 leading-tight">Factura {invoice.invoice_number}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              {invoice.client_name && (
                <p className="text-sm text-gray-400">Para: {invoice.client_name}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Emitida {new Date(invoice.issue_date).toLocaleDateString('es-ES')} · Vence {new Date(invoice.due_date).toLocaleDateString('es-ES')}
              </p>
            </div>
            {invoice.paid ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-900/30 text-green-400 border border-green-800">
                Pagada
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-900/30 text-yellow-400 border border-yellow-800">
                Pendiente
              </span>
            )}
          </div>

          <div className="space-y-2 border-t border-gray-800 pt-4">
            {(invoice.items || []).map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-300">{item.quantity} × {item.description}</span>
                <span className="text-gray-400">{formatCurrency(item.price_cents * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 pt-4 space-y-1">
            <div className="flex justify-between text-sm text-gray-400">
              <span>Subtotal</span>
              <span>{formatCurrency(invoice.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>IVA ({invoice.tax_percent}%)</span>
              <span>{formatCurrency(invoice.total_cents - invoice.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-white pt-1">
              <span>Total</span>
              <span>{formatCurrency(invoice.total_cents)}</span>
            </div>
            {invoice.paid_cents > 0 && !invoice.paid && (
              <div className="flex justify-between text-sm text-primary-400 pt-1">
                <span>Ya cobrado</span>
                <span>-{formatCurrency(invoice.paid_cents)}</span>
              </div>
            )}
          </div>

          {invoice.paid ? (
            <div className="flex items-center justify-center gap-2 bg-green-900/20 border border-green-800 rounded-xl py-4">
              <CheckCircleIcon className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-semibold">Esta factura ya está pagada</span>
            </div>
          ) : (
            <Button onClick={() => setIsPaymentModalOpen(true)} className="w-full text-base py-3">
              Pagar {formatCurrency(invoice.remaining_cents)} con tarjeta
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Pago seguro procesado por Stripe. DevFreelancer nunca almacena los datos de tu tarjeta.
        </p>
      </main>

      {isPaymentModalOpen && (
        <Suspense fallback={null}>
          <StripePaymentModal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            amountCents={invoice.remaining_cents}
            description={`Factura ${invoice.invoice_number}`}
            itemKey="invoicePayment"
            metadata={{ invoice_id: invoice.id }}
            onPaymentSuccess={handlePaymentSuccess}
          />
        </Suspense>
      )}
    </div>
  );
};

export default PublicInvoicePayPage;
