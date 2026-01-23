import React, { useState, useMemo, lazy, Suspense } from 'react';
// FIX: Remove .tsx and .ts extensions from imports to fix module resolution errors.
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { Budget, InvoiceItem } from '../types';
import { formatCurrency } from '../lib/utils';
import { PlusIcon, TrashIcon, CheckCircleIcon, XCircleIcon, MessageSquareIcon, SparklesIcon } from '../components/icons/Icon';
import StatusChip from '../components/ui/StatusChip';
import EmptyState from '../components/ui/EmptyState';
import { generateItemsForDocument, AI_CREDIT_COSTS } from '../services/geminiService';
import { useToast } from '../hooks/useToast';

const BuyCreditsModal = lazy(() => import('../components/modals/BuyCreditsModal'));


const BudgetsPage: React.FC = () => {
    const { 
        budgets, 
        clients, 
        profile,
        addBudget,
        updateBudgetStatus,
        getClientById,
        consumeCredits
    } = useAppStore();
    const { addToast } = useToast();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);
    
    const initialBudgetState = {
        client_id: clients[0]?.id || '',
        description: '',
        items: [{ description: '', quantity: 1, price_cents: 0 }],
    };
    const [newBudget, setNewBudget] = useState(initialBudgetState);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewBudget(prev => ({ ...prev, [name]: value }));
    };

    const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
        const items = [...newBudget.items];
        if(field === 'price_cents') {
            items[index][field] = Math.round(Number(value) * 100);
        } else if (field === 'quantity') {
            items[index][field] = Number(value);
        } else {
            items[index][field] = value as string;
        }
        setNewBudget(prev => ({ ...prev, items }));
    };

    const addItem = () => {
        setNewBudget(prev => ({
            ...prev,
            items: [...prev.items, { description: '', quantity: 1, price_cents: 0 }]
        }));
    };

    const removeItem = (index: number) => {
        if (newBudget.items.length > 1) {
            const items = newBudget.items.filter((_, i) => i !== index);
            setNewBudget(prev => ({ ...prev, items }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addBudget(newBudget);
        setIsModalOpen(false);
        setNewBudget(initialBudgetState);
    };

    const handleAiGenerate = async () => {
        if (profile.ai_credits < AI_CREDIT_COSTS.generateInvoiceItems) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        setIsAiLoading(true);
        try {
            const items = await generateItemsForDocument(aiPrompt, profile.hourly_rate_cents);
            if (items && items.length > 0) {
                setNewBudget(prev => ({ ...prev, items }));
                addToast('Conceptos generados con IA.', 'success');
                consumeCredits(AI_CREDIT_COSTS.generateInvoiceItems);
                setIsAIGeneratorOpen(false);
            } else {
                addToast('No se pudieron generar conceptos. Intenta ser más específico.', 'error');
            }
        } catch (e) {
            addToast((e as Error).message, 'error');
        } finally {
            setIsAiLoading(false);
        }
    };

    const totalAmount = useMemo(() => {
        return newBudget.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
    }, [newBudget.items]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-white">Presupuestos</h1>
                <Button onClick={() => setIsModalOpen(true)}>Crear Presupuesto</Button>
            </div>

            {budgets.length === 0 ? (
                <EmptyState 
                    icon={MessageSquareIcon}
                    title="No hay presupuestos"
                    message="Crea y envía presupuestos a tus clientes para formalizar tus servicios."
                    action={{ text: "Crear Presupuesto", onClick: () => setIsModalOpen(true) }}
                />
            ) : (
                <Card>
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Listado de Presupuestos</h2>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-800">
                                <tr>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4">Cliente</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4">Importe</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {budgets.map(budget => (
                                    <tr key={budget.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-4 text-white font-semibold">{budget.description}</td>
                                        <td className="p-4 text-primary-400">{getClientById(budget.client_id)?.name}</td>
                                        <td className="p-4 text-gray-300">{budget.created_at}</td>
                                        <td className="p-4 text-white">{formatCurrency(budget.amount_cents)}</td>
                                        <td className="p-4"><StatusChip type="budget" status={budget.status} /></td>
                                        <td className="p-4 text-right">
                                            {budget.status === 'pending' && (
                                                <div className="flex gap-2 justify-end">
                                                    <Button size="sm" variant="secondary" title="Aceptar" onClick={() => updateBudgetStatus(budget.id, 'accepted')}><CheckCircleIcon className="w-4 h-4 text-green-400"/></Button>
                                                    <Button size="sm" variant="secondary" title="Rechazar" onClick={() => updateBudgetStatus(budget.id, 'rejected')}><XCircleIcon className="w-4 h-4 text-red-400"/></Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Crear Nuevo Presupuesto">
                <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                             <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
                             <select name="client_id" value={newBudget.client_id} onChange={handleInputChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <Input label="Descripción del Presupuesto" name="description" value={newBudget.description} onChange={handleInputChange} required />
                    </div>
                    
                    <div className="space-y-2 pt-2 border-t border-gray-700">
                        <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-gray-200">Conceptos</h4>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAIGeneratorOpen(true)}><SparklesIcon className="w-4 h-4 mr-1"/>Generar con IA</Button>
                        </div>
                        {newBudget.items.map((item, index) => (
                            <div key={index} className="flex gap-2 items-end">
                                <Input label="Descripción" wrapperClassName="flex-1" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} />
                                <Input label="Cant." type="number" wrapperClassName="w-16" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} />
                                <Input label="Precio (€)" type="number" step="0.01" wrapperClassName="w-24" value={item.price_cents / 100} onChange={e => handleItemChange(index, 'price_cents', e.target.value)} />
                                <Button type="button" variant="danger" size="sm" onClick={() => removeItem(index)}><TrashIcon className="w-4 h-4" /></Button>
                            </div>
                        ))}
                         <Button type="button" variant="secondary" size="sm" onClick={addItem}><PlusIcon className="w-4 h-4 mr-1"/>Añadir Concepto</Button>
                    </div>

                    <div className="text-right font-semibold text-white mt-4">Total: {formatCurrency(totalAmount)}</div>

                    <div className="flex justify-end pt-4">
                        <Button type="submit">Guardar Presupuesto</Button>
                    </div>
                </form>
            </Modal>
            
            {/* AI Generator Modal */}
            <Modal isOpen={isAIGeneratorOpen} onClose={() => setIsAIGeneratorOpen(false)} title="Generar Conceptos con IA">
                <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Describe los conceptos a presupuestar:</label>
                    <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={4} className="w-full p-2 bg-gray-800 text-gray-300 border border-gray-700 rounded-md" placeholder="Ej: desarrollo de una landing page con formulario de contacto y despliegue en Vercel."/>
                    <div className="flex justify-end pt-2">
                        <Button onClick={handleAiGenerate} disabled={isAiLoading || !aiPrompt}>
                           {isAiLoading ? 'Generando...' : `Generar (${AI_CREDIT_COSTS.generateInvoiceItems} créditos)`}
                        </Button>
                    </div>
                </div>
            </Modal>
            
            <Suspense fallback={null}>
                {isBuyCreditsModalOpen && <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />}
            </Suspense>

        </div>
    );
};

export default BudgetsPage;