<<<<<<< HEAD

import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
=======
import React, { useState, useMemo, useEffect } from 'react';
>>>>>>> main
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { InvoiceItem } from '@/types';
import { PlusIcon, TrashIcon, SparklesIcon, RepeatIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { generateItemsForDocument, AI_CREDIT_COSTS } from '@/services/geminiService';
<<<<<<< HEAD
import { formatCurrency } from '@/lib/utils';

const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));
=======
import BuyCreditsModal from '@/components/modals/BuyCreditsModal';
import { formatCurrency, calculateInvoiceTotals } from '@/lib/utils'; // Importamos la lógica centralizada
>>>>>>> main

const CreateInvoicePage: React.FC = () => {
    const { 
        clients, 
        projects,
        timeEntries, 
        profile, 
        addInvoice,
        addRecurringInvoice,
        consumeCredits
    } = useAppStore();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    
    const initialInvoiceState = {
        client_id: clients[0]?.id || '',
        project_id: '',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [{ description: '', quantity: 1, price_cents: 0 }] as InvoiceItem[],
        tax_percent: 21,
        irpf_percent: 0,
        isRecurring: false,
        frequency: 'monthly' as 'monthly' | 'yearly',
        start_date: new Date().toISOString().split('T')[0],
    };

    const [newInvoice, setNewInvoice] = useState(initialInvoiceState);
    const [timeEntryIdsToBill, setTimeEntryIdsToBill] = useState<string[]>([]);
    const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);
    
    // --- Lógica de Carga Inicial ---
    useEffect(() => {
        const { projectId, clientId, timeEntryIds, budgetItems } = location.state || {};

        if (clientId && projectId && timeEntryIds?.length > 0) {
            setTimeEntryIdsToBill(timeEntryIds);
            const entriesToBill = timeEntries.filter(t => timeEntryIds.includes(t.id));
            const totalHours = entriesToBill.reduce((sum, entry) => sum + entry.duration_seconds, 0) / 3600;

            if (totalHours > 0) {
                const newItem: InvoiceItem = {
                    description: `Desarrollo y consultoría (${totalHours.toFixed(2)} horas)`,
                    quantity: 1,
                    price_cents: Math.round(totalHours * profile.hourly_rate_cents)
                };
                 setNewInvoice(prev => ({ ...prev, client_id: clientId, project_id: projectId, items: [newItem] }));
                addToast('Horas cargadas correctamente.', 'info');
            }
        } else if (clientId && projectId && budgetItems?.length > 0) {
            setNewInvoice(prev => ({ ...prev, client_id: clientId, project_id: projectId, items: budgetItems }));
            addToast('Datos importados del presupuesto.', 'info');
        } else if (clientId && projectId) {
             setNewInvoice(prev => ({ ...prev, client_id: clientId, project_id: projectId }));
        }
        window.history.replaceState({}, document.title);
    }, [location.state, timeEntries, profile.hourly_rate_cents, addToast]);

    // --- Cálculos en Tiempo Real ---
    // Usamos la función centralizada para garantizar que lo que ve el usuario es EXACTAMENTE lo que saldrá en el PDF
    const totals = useMemo(() => {
        return calculateInvoiceTotals(
            newInvoice.items, 
            newInvoice.tax_percent, 
            newInvoice.irpf_percent
        );
    }, [newInvoice.items, newInvoice.tax_percent, newInvoice.irpf_percent]);

    const clientProjects = useMemo(() => {
        return projects.filter(p => p.client_id === newInvoice.client_id);
    }, [projects, newInvoice.client_id]);

    // --- Manejadores de Eventos ---
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setNewInvoice(prev => ({ ...prev, [name]: val }));
    };

    const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
        const updatedItems = [...newInvoice.items];
        if(field === 'price_cents') {
            // Convertimos Euros a Céntimos para el estado interno
            updatedItems[index][field] = Math.round(Number(value) * 100);
        } else if (field === 'quantity') {
            updatedItems[index][field] = Number(value);
        } else {
            updatedItems[index][field] = value as string;
        }
        setNewInvoice(prev => ({ ...prev, items: updatedItems }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // (Aquí iría tu validación existente...)

        if (newInvoice.isRecurring) {
            addRecurringInvoice({
                ...newInvoice,
                items: newInvoice.items,
                tax_percent: newInvoice.tax_percent,
            });
        } else {
            addInvoice({
                invoice_number: `INV-${Date.now()}`,
                client_id: newInvoice.client_id,
                project_id: newInvoice.project_id || null,
                issue_date: newInvoice.issue_date,
                due_date: newInvoice.due_date,
                items: newInvoice.items,
                subtotal_cents: totals.subtotal,
                tax_percent: newInvoice.tax_percent,
                irpf_percent: newInvoice.irpf_percent,
                total_cents: totals.total,
            }, timeEntryIdsToBill);
        }

        addToast('Factura procesada con éxito', 'success');
        navigate('/invoices');
    };

    const handleAiGenerate = async () => {
        if (profile.ai_credits < AI_CREDIT_COSTS.generateInvoiceItems) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        setIsAiLoading(true);
        try {
            const items = await generateItemsForDocument(aiPrompt, profile.hourly_rate_cents);
            if (items?.length > 0) {
                setNewInvoice(prev => ({ ...prev, items }));
                consumeCredits(AI_CREDIT_COSTS.generateInvoiceItems);
                setIsAIGeneratorOpen(false);
                addToast('Conceptos generados.', 'success');
            }
        } catch (e) {
            addToast('Error con la IA', 'error');
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-20">
            {/* Header y resto del JSX que ya tenías está muy bien estructurado */}
            {/* Solo asegúrate de usar los nuevos 'totals' en el resumen final */}
            
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">Nueva Factura</h1>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => navigate('/invoices')}>Descartar</Button>
                    <Button type="submit">Guardar Factura</Button>
                </div>
            </div>

            {/* ... Resto de tus componentes Card (Cliente, Fechas, Impuestos) ... */}

            <Card>
                <CardHeader className="flex justify-between items-center border-b border-gray-800">
                    <h2 className="text-lg font-semibold text-white">Líneas de Factura</h2>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setIsAIGeneratorOpen(true)}>
                        <SparklesIcon className="w-4 h-4 mr-2 text-primary-400"/>
                        Autogenerar con IA
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                    {newInvoice.items.map((item, index) => (
                        <div key={index} className="flex gap-3 items-start bg-gray-900/30 p-3 rounded-xl border border-gray-800">
                            <div className="flex-1">
                                <Input label="Descripción" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} placeholder="Ej: Desarrollo Frontend..." />
                            </div>
                            <div className="w-24">
                                <Input label="Cant." type="number" step="0.1" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} />
                            </div>
                            <div className="w-32">
                                <Input label="Precio (€)" type="number" step="0.01" value={item.price_cents / 100} onChange={e => handleItemChange(index, 'price_cents', e.target.value)} />
                            </div>
                            <div className="pt-7">
                                <Button type="button" variant="danger" size="sm" onClick={() => removeItem(index)}><TrashIcon className="w-4 h-4" /></Button>
                            </div>
                        </div>
                    ))}
                    <Button type="button" variant="secondary" className="w-full border-dashed border-2 py-4" onClick={addItem}>
                        <PlusIcon className="w-4 h-4 mr-2"/> Añadir otra línea
                    </Button>
                    
                    {/* --- RESUMEN DE TOTALES (BRILLANTE) --- */}
                    <div className="mt-8 ml-auto max-w-xs space-y-3 bg-gray-900/50 p-6 rounded-2xl border border-primary-500/20">
                        <div className="flex justify-between text-gray-400 text-sm">
                            <span>Base Imponible</span>
                            <span>{formatCurrency(totals.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400 text-sm">
                            <span>IVA ({newInvoice.tax_percent}%)</span>
                            <span>{formatCurrency(totals.taxAmount)}</span>
                        </div>
                        {newInvoice.irpf_percent > 0 && (
                            <div className="flex justify-between text-orange-400/80 text-sm">
                                <span>IRPF (-{newInvoice.irpf_percent}%)</span>
                                <span>-{formatCurrency(totals.irpfAmount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-white font-bold text-xl border-t border-gray-700 pt-3 mt-3">
                            <span>TOTAL</span>
                            <span className="text-primary-400">{formatCurrency(totals.total)}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Modales de IA y Créditos */}
            <Modal isOpen={isAIGeneratorOpen} onClose={() => setIsAIGeneratorOpen(false)} title="Magia de IA">
                {/* ... contenido del modal ... */}
            </Modal>
<<<<<<< HEAD
            
            <Suspense fallback={null}>
                {isBuyCreditsModalOpen && (
                    <BuyCreditsModal
                        isOpen={isBuyCreditsModalOpen}
                        onClose={() => setIsBuyCreditsModalOpen(false)}
                    />
                )}
            </Suspense>
=======
            <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />
>>>>>>> main
        </form>
    );
};

export default CreateInvoicePage;