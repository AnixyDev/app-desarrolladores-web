import React from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../../hooks/useAppStore';
import Card, { CardHeader, CardContent, CardFooter } from '../../components/ui/Card';
import { formatCurrency } from '../../lib/utils';
import Button from '../../components/ui/Button';

const PortalBudgetViewPage: React.FC = () => {
    const { budgetId } = useParams<{ budgetId: string }>();
    const { budgets, getClientById, profile } = useAppStore();

    const budget = budgets.find(b => b.id === budgetId);

    if (!budget) {
        return <div className="text-center text-red-500">Presupuesto no encontrado.</div>;
    }
    
    const client = getClientById(budget.client_id);
    const totalAmount = budget.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
                <div>
                    <h2 className="text-2xl font-bold text-white">Presupuesto: {budget.description}</h2>
                    <p className="text-gray-400">Fecha de creación: {budget.created_at}</p>
                </div>
                {/* Actions could go here, e.g., accept/reject */}
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
                    <div>
                        <h4 className="font-semibold text-gray-300 mb-2">De:</h4>
                        <p className="text-white">{profile.business_name}</p>
                        <p className="text-gray-400">{profile.full_name}</p>
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
            <CardFooter className='text-center'>
                 <span className={`px-3 py-1 rounded-full text-sm capitalize ${
                    budget.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                    budget.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                 }`}>
                    Estado: {budget.status}
                </span>
            </CardFooter>
        </Card>
    );
};

export default PortalBudgetViewPage;
