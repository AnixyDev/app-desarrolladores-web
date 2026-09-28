import React, { useState, lazy, Suspense } from 'react';
// FIX: Remove .tsx and .ts extensions from imports to fix module resolution errors.
import { useAppStore } from '../hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { Expense, RecurringExpense } from '@/types';
import { formatCurrency, formatearFecha } from '@/lib/utils';
import { PlusIcon, TrashIcon, RepeatIcon, SparklesIcon, EditIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { ExtractedExpenseData } from '@/services/geminiService';

const ConfirmationModal = lazy(() => import('@/components/modals/ConfirmationModal'));
const ExpenseOcrModal = lazy(() => import('@/components/modals/ExpenseOcrModal'));

const ExpensesPage: React.FC = () => {
    const { expenses, recurringExpenses, addExpense, updateExpense, deleteExpense, addRecurringExpense, updateRecurringExpense, deleteRecurringExpense, projects } = useAppStore(useShallow(s => ({ expenses: s.expenses, recurringExpenses: s.recurringExpenses, addExpense: s.addExpense, updateExpense: s.updateExpense, deleteExpense: s.deleteExpense, addRecurringExpense: s.addRecurringExpense, updateRecurringExpense: s.updateRecurringExpense, deleteRecurringExpense: s.deleteRecurringExpense, projects: s.projects })));
    // Gasto (o gasto recurrente) que se está editando; null = crear uno nuevo.
    const [gastoEnEdicion, setGastoEnEdicion] = useState<Expense | null>(null);
    const [recurrenteEnEdicion, setRecurrenteEnEdicion] = useState<RecurringExpense | null>(null);
    const [proximaFecha, setProximaFecha] = useState('');
    const { addToast } = useToast();

    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'single' | 'recurring' } | null>(null);

    const initialExpenseState: Omit<Expense, 'id' | 'user_id' | 'created_at'> & { description: string; tax_percent: number } = {
        description: '',
        amount_cents: 0,
        tax_percent: 21,
        date: new Date().toISOString().split('T')[0],
        category: 'Software',
        project_id: '',
    };
    const [newExpense, setNewExpense] = useState(initialExpenseState);

    const initialRecurringState: Omit<RecurringExpense, 'id' | 'user_id' | 'created_at' | 'next_date'> & { description: string } = {
        description: '',
        amount_cents: 0,
        category: 'Software',
        frequency: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
    };
    const [newRecurringExpense, setNewRecurringExpense] = useState(initialRecurringState);
    
    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewExpense(prev => ({ ...prev, [name]: value }));
    };

    const handleRecurringChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewRecurringExpense(prev => ({ ...prev, [name]: value as any }));
    };


    const abrirNuevoGasto = () => {
        setGastoEnEdicion(null);
        setNewExpense(initialExpenseState);
        setIsExpenseModalOpen(true);
    };

    const abrirEdicionGasto = (gasto: Expense) => {
        setGastoEnEdicion(gasto);
        setNewExpense({
            description: gasto.description,
            amount_cents: gasto.amount_cents / 100,
            tax_percent: gasto.tax_percent,
            date: gasto.date.slice(0, 10),
            category: gasto.category,
            project_id: gasto.project_id ?? '',
        });
        setIsExpenseModalOpen(true);
    };

    const abrirNuevoRecurrente = () => {
        setRecurrenteEnEdicion(null);
        setNewRecurringExpense(initialRecurringState);
        setIsRecurringModalOpen(true);
    };

    const abrirEdicionRecurrente = (gasto: RecurringExpense) => {
        setRecurrenteEnEdicion(gasto);
        setNewRecurringExpense({
            description: gasto.description,
            amount_cents: gasto.amount_cents / 100,
            category: gasto.category,
            frequency: gasto.frequency,
            start_date: gasto.start_date.slice(0, 10),
        });
        setProximaFecha(gasto.next_date.slice(0, 10));
        setIsRecurringModalOpen(true);
    };

    const handleExpenseSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const datos = {
            description: newExpense.description,
            category: newExpense.category,
            date: newExpense.date,
            amount_cents: Math.round(Number(newExpense.amount_cents) * 100),
            tax_percent: Number(newExpense.tax_percent) || 0,
            // '' no es un uuid válido: sin proyecto va null.
            project_id: newExpense.project_id || null,
        };
        try {
            if (gastoEnEdicion) {
                await updateExpense(gastoEnEdicion.id, datos);
                addToast('Gasto actualizado.', 'success');
            } else {
                await addExpense(datos);
                addToast('Gasto añadido.', 'success');
            }
            setIsExpenseModalOpen(false);
            setGastoEnEdicion(null);
            setNewExpense(initialExpenseState);
        } catch (err) {
            addToast((err as Error).message || 'No se pudo guardar el gasto.', 'error');
        }
    };

    const handleRecurringSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const datos = {
            ...newRecurringExpense,
            amount_cents: Math.round(Number(newRecurringExpense.amount_cents) * 100),
        };
        try {
            if (recurrenteEnEdicion) {
                await updateRecurringExpense(recurrenteEnEdicion.id, {
                    description: datos.description,
                    amount_cents: datos.amount_cents,
                    category: datos.category,
                    frequency: datos.frequency,
                    next_date: proximaFecha || recurrenteEnEdicion.next_date,
                });
                addToast('Gasto recurrente actualizado.', 'success');
            } else {
                await addRecurringExpense(datos);
                addToast('Gasto recurrente añadido.', 'success');
            }
            setIsRecurringModalOpen(false);
            setRecurrenteEnEdicion(null);
            setNewRecurringExpense(initialRecurringState);
        } catch (err) {
            addToast((err as Error).message || 'No se pudo guardar el gasto recurrente.', 'error');
        }
    };

    // El OCR solo rellena el formulario existente; el usuario siempre revisa
    // y confirma manualmente pulsando "Guardar Gasto" (mismo flujo de
    // validación y guardado que un gasto añadido a mano).
    const handleOcrExtracted = (data: ExtractedExpenseData) => {
        setGastoEnEdicion(null);
        setNewExpense({
            description: data.vendor_name ? `${data.description} — ${data.vendor_name}` : data.description,
            amount_cents: data.amount_cents / 100,
            tax_percent: data.tax_percent,
            date: data.date,
            category: data.category,
            project_id: '',
        });
        setIsExpenseModalOpen(true);
    };

    const handleDeleteClick = (id: string, type: 'single' | 'recurring') => {
        setItemToDelete({ id, type });
        setIsConfirmModalOpen(true);
    };
    
    const confirmDelete = async () => {
        if (itemToDelete) {
            try {
                if (itemToDelete.type === 'single') {
                    await deleteExpense(itemToDelete.id);
                } else {
                    await deleteRecurringExpense(itemToDelete.id);
                }
            } catch (err) {
                addToast((err as Error).message || 'No se pudo eliminar.', 'error');
            }
            setIsConfirmModalOpen(false);
            setItemToDelete(null);
        }
    };

    return (
        <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <h1 className="text-2xl font-semibold text-white">Gastos</h1>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setIsOcrModalOpen(true)} variant="secondary">
                        <SparklesIcon className="w-4 h-4 mr-2" /> Escanear Ticket (IA)
                    </Button>
                    <Button onClick={abrirNuevoRecurrente} variant="secondary">
                        <RepeatIcon className="w-4 h-4 mr-2" /> Añadir Gasto Recurrente
                    </Button>
                    <Button onClick={abrirNuevoGasto}>
                        <PlusIcon className="w-4 h-4 mr-2" /> Añadir Gasto
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Gastos Únicos</h2>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-800">
                                <tr>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4">Importe</th>
                                    <th className="p-4 sticky right-0 bg-gray-900"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map(expense => (
                                    <tr key={expense.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-4 text-white">{(expense as any).description}</td>
                                        <td className="p-4 text-gray-300">{formatearFecha(expense.date)}</td>
                                        <td className="p-4 text-white font-semibold">{formatCurrency(expense.amount_cents)}</td>
                                        <td className="p-4 text-right sticky right-0 bg-gray-900/95 backdrop-blur-sm">
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="secondary" onClick={() => abrirEdicionGasto(expense)} title="Editar">
                                                    <EditIcon className="w-4 h-4" />
                                                </Button>
                                                <Button size="sm" variant="danger" onClick={() => handleDeleteClick(expense.id, 'single')} title="Eliminar">
                                                    <TrashIcon className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Gastos Recurrentes</h2>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-800">
                                <tr>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4">Próximo Vencimiento</th>
                                    <th className="p-4">Importe</th>
                                    <th className="p-4 sticky right-0 bg-gray-900"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recurringExpenses.map(expense => (
                                    <tr key={expense.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-4 text-white">{(expense as any).description}</td>
                                        <td className="p-4 text-gray-300">{formatearFecha(expense.next_date)}</td>
                                        <td className="p-4 text-white font-semibold">{formatCurrency(expense.amount_cents)}</td>
                                        <td className="p-4 text-right sticky right-0 bg-gray-900/95 backdrop-blur-sm">
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="secondary" onClick={() => abrirEdicionRecurrente(expense)} title="Editar">
                                                    <EditIcon className="w-4 h-4" />
                                                </Button>
                                                <Button size="sm" variant="danger" onClick={() => handleDeleteClick(expense.id, 'recurring')} title="Eliminar">
                                                    <TrashIcon className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            {/* Modal for single expense */}
            <Modal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} title={gastoEnEdicion ? 'Editar gasto' : 'Añadir Nuevo Gasto'}>
                <form onSubmit={handleExpenseSubmit} className="space-y-4">
                    <Input name="description" label="Descripción" value={newExpense.description} onChange={handleExpenseChange} required />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input name="amount_cents" label="Importe (€)" type="number" step="0.01" value={newExpense.amount_cents} onChange={handleExpenseChange} required />
                        <Input name="tax_percent" label="IVA Soportado (%)" type="number" value={newExpense.tax_percent} onChange={handleExpenseChange} />
                    </div>
                    <Input name="date" label="Fecha" type="date" value={newExpense.date} onChange={handleExpenseChange} required />
                    <Input name="category" label="Categoría" value={newExpense.category} onChange={handleExpenseChange} />
                    <div>
                         <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto (Opcional)</label>
                         <select name="project_id" value={newExpense.project_id ?? ''} onChange={handleExpenseChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                            <option value="">Ninguno</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit">{gastoEnEdicion ? 'Guardar cambios' : 'Guardar Gasto'}</Button>
                    </div>
                </form>
            </Modal>
            
            {/* Modal for recurring expense */}
            <Modal isOpen={isRecurringModalOpen} onClose={() => setIsRecurringModalOpen(false)} title={recurrenteEnEdicion ? 'Editar gasto recurrente' : 'Añadir Gasto Recurrente'}>
                <form onSubmit={handleRecurringSubmit} className="space-y-4">
                    <Input name="description" label="Descripción" value={newRecurringExpense.description} onChange={handleRecurringChange} required />
                    <Input name="amount_cents" label="Importe (€)" type="number" step="0.01" value={newRecurringExpense.amount_cents} onChange={handleRecurringChange} required />
                    {recurrenteEnEdicion ? (
                        <Input label="Próximo cargo" type="date" value={proximaFecha} onChange={(e) => setProximaFecha(e.target.value)} required />
                    ) : (
                        <Input name="start_date" label="Fecha de Inicio" type="date" value={newRecurringExpense.start_date} onChange={handleRecurringChange} required />
                    )}
                    <Input name="category" label="Categoría" value={newRecurringExpense.category} onChange={handleRecurringChange} />
                     <div>
                         <label className="block text-sm font-medium text-gray-300 mb-1">Frecuencia</label>
                         <select name="frequency" value={newRecurringExpense.frequency} onChange={handleRecurringChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                            <option value="monthly">Mensual</option>
                            <option value="yearly">Anual</option>
                        </select>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit">{recurrenteEnEdicion ? 'Guardar cambios' : 'Guardar Gasto Recurrente'}</Button>
                    </div>
                </form>
            </Modal>
            
            <Suspense fallback={null}>
                {isConfirmModalOpen && (
                    <ConfirmationModal 
                        isOpen={isConfirmModalOpen}
                        onClose={() => setIsConfirmModalOpen(false)}
                        onConfirm={confirmDelete}
                        title="¿Eliminar Gasto?"
                        message="Esta acción eliminará el gasto de forma permanente. ¿Estás seguro de que quieres continuar?"
                    />
                )}
                {isOcrModalOpen && (
                    <ExpenseOcrModal
                        isOpen={isOcrModalOpen}
                        onClose={() => setIsOcrModalOpen(false)}
                        onExtracted={handleOcrExtracted}
                    />
                )}
            </Suspense>

        </div>
    );
};

export default ExpensesPage;