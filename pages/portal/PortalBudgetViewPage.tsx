// pages/portal/PortalBudgetViewPage.tsx
// FIX: misma clase de bug — leía useAppStore().budgets (vacío en sesión de
// cliente) y "profile" (también vacío/incorrecto). Añadida acción real de
// aceptar/rechazar (antes solo había un comentario "Actions could go here").
import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { Budget } from '@/types';

interface PortalContext {
    clientId: string;
    ownerBusinessName: string | null;
    ownerFullName: string | null;
}

const PortalBudgetViewPage: React.FC = () => {
    const { budgetId } = useParams<{ budgetId: string }>();
    const { clientId, ownerBusinessName, ownerFullName } = useOutletContext<PortalContext>();
    const { addToast } = useToast();

    const [budget, setBudget] = useState<Budget | null>(null);
    const [clientName, setClientName] = useState<string>('');
    const [clientCompany, setClientCompany] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (!clientId || !budgetId) return;

        const load = async () => {
            setLoading(true);
            const [budgetRes, clientRes] = await Promise.all([
                supabase.from('budgets').select('*').eq('id', budgetId).eq('client_id', clientId).single(),
                supabase.from('clients').select('name, company').eq('id', clientId).single(),
            ]);

            if (budgetRes.error || !budgetRes.data) {
                setNotFound(true);
            } else {
                setBudget(budgetRes.data as Budget);
                setClientName(clientRes.data?.name || '');
                setClientCompany(clientRes.data?.company || '');
            }
            setLoading(false);
        };

        load();
    }, [clientId, budgetId]);

    const handleDecision = async (status: 'accepted' | 'rejected') => {
        if (!budget) return;
        setIsUpdating(true);

        const { error } = await supabase
            .from('budgets')
            .update({ status })
            .eq('id', budget.id)
            .eq('client_id', clientId);

        setIsUpdating(false);

        if (error) {
            addToast('No se pudo registrar tu respuesta. Inténtalo de nuevo.', 'error');
            return;
        }

        setBudget(prev => prev ? { ...prev, status } : prev);
        addToast(status === 'accepted' ? 'Presupuesto aceptado.' : 'Presupuesto rechazado.', 'success');
    };

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
            </div>
        );
    }

    if (notFound || !budget) {
        return <div className="text-center text-red-500">Presupuesto no encontrado.</div>;
    }

    const totalAmount = budget.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
                <div>
                    <h2 className="text-2xl font-bold text-white">Presupuesto: {budget.description}</h2>
                    <p className="text-gray-400">Fecha de creación: {budget.created_at}</p>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
                    <div>
                        <h4 className="font-semibold text-gray-300 mb-2">De:</h4>
                        <p className="text-white">{ownerBusinessName || ownerFullName}</p>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-300 mb-2">Para:</h4>
                        <p className="text-white">{clientName}</p>
                        <p className="text-gray-400">{clientCompany}</p>
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
                            {budget.items.map((item, index) => (
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
                        <div className="flex justify-between font-bold text-white text-lg border-t border-gray-700 pt-2 mt-2">
                            <span>TOTAL PRESUPUESTADO:</span>
                            <span>{formatCurrency(totalAmount)}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className='flex flex-col sm:flex-row justify-between items-center gap-4'>
                <span className={`px-3 py-1 rounded-full text-sm capitalize ${
                    budget.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                    budget.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                 }`}>
                    Estado: {budget.status}
                </span>
                {budget.status === 'pending' && (
                    <div className="flex gap-2">
                        <Button variant="secondary" disabled={isUpdating} onClick={() => handleDecision('rejected')}>Rechazar</Button>
                        <Button disabled={isUpdating} onClick={() => handleDecision('accepted')}>Aceptar Presupuesto</Button>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
};

export default PortalBudgetViewPage;