
import React, { useState, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../../hooks/useAppStore';
import Card, { CardHeader, CardContent, CardFooter } from '../../components/ui/Card';
import { formatCurrency } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';

const StripePaymentModal = lazy(() => import('../../components/modals/StripePaymentModal'));

const PortalInvoiceViewPage: React.FC = () => {
    const { invoiceId } = useParams<{ invoiceId: string }>();
    const { invoices, getClientById, profile, markInvoiceAsPaid } = useAppStore();
    const { addToast } = useToast();
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    const invoice = invoices.find(i => i.id === invoiceId);

    if (!invoice) {
        return <div className="text-center text-red-500">Factura no encontrada.</div>;
    }
    
    const client = getClientById(invoice.client_id);
    
    const handlePaymentSuccess = () => {
        markInvoiceAsPaid(invoice.id);
        addToast("¡Pago realizado con éxito! Gracias.", "success");
        // Don't close immediately here, modal handles delayed close for UX
    };

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
                        <p className="text-white">{profile.business_name}</p>
                        <p className="text-gray-400">{profile.full_name}</p>
                        <p className="text-gray-400">{profile.tax_id}</p>
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
