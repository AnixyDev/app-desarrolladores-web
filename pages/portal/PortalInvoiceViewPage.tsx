// pages/portal/PortalInvoiceViewPage.tsx
// FIX: esta página leía `useAppStore().invoices` (el store global, scoped a
// la sesión del FREELANCER vía RLS auth.uid()=user_id). Un cliente entra al
// portal con su propia sesión OTP, así que ese array siempre estaba vacío
// y la página mostraba "Factura no encontrada" para cualquier cliente real.
// Ahora sigue el mismo patrón que PortalDashboardPage.tsx: clientId viene
// del contexto de PortalLayout y la factura se consulta directamente,
// filtrada por client_id.
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { Invoice, Client } from '@/types';

const StripePaymentModal = lazy(() => import('@/components/modals/StripePaymentModal'));

interface PortalContext {
    clientId: string;
    ownerBusinessName: string | null;
    ownerFullName: string | null;
}

const PortalInvoiceViewPage: React.FC = () => {
    const { invoiceId } = useParams<{ invoiceId: string }>();
    const { clientId, ownerBusinessName, ownerFullName } = useOutletContext<PortalContext>();
    const { addToast } = useToast();

    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [client, setClient] = useState<Pick<Client, 'name' | 'company'> | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    useEffect(() => {
        if (!clientId || !invoiceId) return;

        const load = async () => {
            setLoading(true);
            const [invoiceRes, clientRes] = await Promise.all([
                supabase.from('invoices').select('*').eq('id', invoiceId).eq('client_id', clientId).single(),
                supabase.from('clients').select('name, company').eq('id', clientId).single(),
            ]);

            if (invoiceRes.error || !invoiceRes.data) {
                setNotFound(true);
            } else {
                setInvoice(invoiceRes.data as Invoice);
                setClient(clientRes.data as Pick<Client, 'name' | 'company'> | null);
            }
            setLoading(false);
        };

        load();
    }, [clientId, invoiceId]);

    // FIX: antes esto llamaba a markInvoiceAsPaid() del store global, que
    // intenta un UPDATE en `invoices` con la sesión del cliente — sin
    // garantía de que la RLS lo permita, y si fallaba, el error se tragaba
    // en silencio (financeSlice.ts) mostrando igualmente "éxito". El Edge
    // Function stripe-webhook ahora marca la factura como pagada de forma
    // autoritativa en el servidor al recibir payment_intent.succeeded; aquí
    // solo reflejamos el estado en la UI al instante.
    const handlePaymentSuccess = () => {
        setInvoice(prev => prev ? { ...prev, paid: true, payment_date: new Date().toISOString() } : prev);
        addToast("¡Pago realizado con éxito! Gracias.", "success");
    };

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
            </div>
        );
    }

    if (notFound || !invoice) {
        return <div className="text-center text-red-500">Factura no encontrada.</div>;
    }

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
                <div>
                    <h2 className="text-2xl font-bold text-white">Factura {invoice.invoice_number}</h2>
                    <p className="text-gray-400">Fecha de emisión: {invoice.issue_date}</p>
                    <p className="text-gray-400">Fecha de vencimiento: {invoice.due_date}</p>
                </div>
                {!invoice.paid && (
                     <Button onClick={() => setIsPaymentModalOpen(true)}>
                        Pagar Factura Online
                     </Button>
                )}
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
                    <div>
                        <h4 className="font-semibold text-gray-300 mb-2">De:</h4>
                        <p className="text-white">{ownerBusinessName || ownerFullName}</p>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-300 mb-2">Para:</h4>
                        <p className="text-white">{client?.name}</p>
                        <p className="text-gray-400">{client?.company}</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px] text-left mb-8">
                        <thead className='border-b border-gray-700'>
                            <tr>
                                <th className='p-2 font-semibold'>Descripción</th>
                                <th className='p-2 font-semibold text-center'>Cantidad</th>
                                <th className='p-2 font-semibold text-right'>Precio Unit.</th>
                                <th className='p-2 font-semibold text-right'>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.items.map((item, index) => (
                                <tr key={index} className='border-b border-gray-800'>
                                    <td className='p-2'>{item.description}</td>
                                    <td className='p-2 text-center'>{item.quantity}</td>
                                    <td className='p-2 text-right'>{formatCurrency(item.price_cents)}</td>
                                    <td className='p-2 text-right'>{formatCurrency(item.price_cents * item.quantity)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                <div className="flex justify-end">
                    <div className="w-full max-w-xs space-y-2 text-right">
                        <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>{formatCurrency(invoice.subtotal_cents)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>IVA ({invoice.tax_percent}%):</span>
                            <span>{formatCurrency(invoice.total_cents - invoice.subtotal_cents)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-white text-lg border-t border-gray-700 pt-2 mt-2">
                            <span>TOTAL:</span>
                            <span>{formatCurrency(invoice.total_cents)}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className='text-center'>
                 <span className={`px-3 py-1 rounded-full text-sm ${
                    invoice.paid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                 }`}>
                    {invoice.paid ? `Pagada el ${invoice.payment_date ? new Date(invoice.payment_date).toLocaleDateString() : 'fecha desconocida'}` : 'Pendiente de Pago'}
                </span>
            </CardFooter>

            <Suspense fallback={null}>
                {isPaymentModalOpen && (
                    <StripePaymentModal 
                        isOpen={isPaymentModalOpen}
                        onClose={() => setIsPaymentModalOpen(false)}
                        amountCents={invoice.total_cents}
                        description={`Pago Factura ${invoice.invoice_number}`}
                        metadata={{ invoice_id: invoice.id }}
                        onPaymentSuccess={handlePaymentSuccess}
                    />
                )}
            </Suspense>
        </Card>
    );
};

export default PortalInvoiceViewPage;