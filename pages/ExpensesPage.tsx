import React, { useState, lazy, Suspense } from 'react';
// FIX: Remove .tsx and .ts extensions from imports to fix module resolution errors.
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { Expense, RecurringExpense } from '../types';
import { formatCurrency } from '../lib/utils';
import { PlusIcon, TrashIcon, RepeatIcon } from '../components/icons/Icon';

const ConfirmationModal = lazy(() => import('../components/modals/ConfirmationModal'));

const ExpensesPage: React.FC = () => {
    const {
        expenses,
        recurringExpenses,
        addExpense,
        deleteExpense,
        addRecurringExpense,
        deleteRecurringExpense,
        projects,
    } = useAppStore();

    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'single' | 'recurring' } | null>(null);

    const initialExpenseState: Omit<Expense, 'id' | 'user_id' | 'created_at'> = {
        description: '',
        amount_cents: 0,
        tax_percent: 21,
        date: new Date().toISOString().split('T')[0],
        category: 'Software',
        project_id: '',
    };
    const [newExpense, setNewExpense] = useState(initialExpenseState);

    const initialRecurringState: Omit<RecurringExpense, 'id' | 'user_id' | 'created_at' | 'next_due_date'> = {
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


    const handleExpenseSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addExpense({
            ...newExpense,
            amount_cents: Math.round(Number(newExpense.amount_cents) * 100),
            tax_percent: Number(newExpense.tax_percent) || 0,
        });
        setIsExpenseModalOpen(false);
        setNewExpense(initialExpenseState);
    };

    const handleRecurringSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addRecurringExpense({
            ...newRecurringExpense,
            amount_cents: Math.round(Number(newRecurringExpense.amount_cents) * 100),
        });
        setIsRecurringModalOpen(false);
        setNewRecurringExpense(initialRecurringState);
    };

    const handleDeleteClick = (id: string, type: 'single' | 'recurring') => {
        setItemToDelete({ id, type });
        setIsConfirmModalOpen(true);
    };
    
    const confirmDelete = () => {
        if (itemToDelete) {
            if (itemToDelete.type === 'single') {
                deleteExpense(itemToDelete.id);
            } else {
                deleteRecurringExpense(itemToDelete.id);
            }
            setIsConfirmModalOpen(false);
            setItemToDelete(null);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-white">Gastos</h1>
                <div className="flex gap-2">
                    <Button onClick={() => setIsRecurringModalOpen(true)} variant="secondary">
                        <RepeatIcon className="w-4 h-4 mr-2" /> Añadir Gasto Recurrente
                    </Button>
                    <Button onClick={() => setIsExpenseModalOpen(true)}>
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
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-800">
                                <tr>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4">Importe</th>
                                    <th className="p-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map(expense => (
                                    <tr key={expense.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-4 text-white">{expense.description}</td>
                                        <td className="p-4 text-gray-300">{expense.date}</td>
                                        <td className="p-4 text-white font-semibold">{formatCurrency(expense.amount_cents)}</td>
                                        <td className="p-4 text-right">
                                            <Button size="sm" variant="danger" onClick={() => handleDeleteClick(expense.id, 'single')}>
                                                <TrashIcon className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Gastos Recurrentes</h2>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-800">
                                <tr>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4">Próximo Vencimiento</th>
                                    <th className="p-4">Importe</th>
                                    <th className="p-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recurringExpenses.map(expense => (
                                    <tr key={expense.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-4 text-white">{expense.description}</td>
                                        <td className="p-4 text-gray-300">{expense.next_due_date}</td>
                                        <td className="p-4 text-white font-semibold">{formatCurrency(expense.amount_cents)}</td>
                                        <td className="p-4 text-right">
                                            <Button size="sm" variant="danger" onClick={() => handleDeleteClick(expense.id, 'recurring')}>
                                                <TrashIcon className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
            
            {/* Modal for single expense */}
            <Modal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} title="Añadir Nuevo Gasto">
                <form onSubmit={handleExpenseSubmit} className="space-y-4">
                    <Input name="description" label="Descripción" value={newExpense.description} onChange={handleExpenseChange} required />
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="amount_cents" label="Importe (€)" type="number" step="0.01" value={newExpense.amount_cents} onChange={handleExpenseChange} required />
                        <Input name="tax_percent" label="IVA Soportado (%)" type="number" value={newExpense.tax_percent} onChange={handleExpenseChange} />
                    </div>
                    <Input name="date" label="Fecha" type="date" value={newExpense.date} onChange={handleExpenseChange} required />
                    <Input name="category" label="Categoría" value={newExpense.category} onChange={handleExpenseChange} />
                    <div>
                         <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto (Opcional)</label>
                         <select name="project_id" value={newExpense.project_id} onChange={handleExpenseChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                            <option value="">Ninguno</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit">Guardar Gasto</Button>
                    </div>
                </form>
            </Modal>
            
            {/* Modal for recurring expense */}
            <Modal isOpen={isRecurringModalOpen} onClose={() => setIsRecurringModalOpen(false)} title="Añadir Gasto Recurrente">
                <form onSubmit={handleRecurringSubmit} className="space-y-4">
                    <Input name="description" label="Descripción" value={newRecurringExpense.description} onChange={handleRecurringChange} required />
                    <Input name="amount_cents" label="Importe (€)" type="number" step="0.01" value={newRecurringExpense.amount_cents} onChange={handleRecurringChange} required />
                    <Input name="start_date" label="Fecha de Inicio" type="date" value={newRecurringExpense.start_date} onChange={handleRecurringChange} required />
                    <Input name="category" label="Categoría" value={newRecurringExpense.category} onChange={handleRecurringChange} />
                     <div>
                         <label className="block text-sm font-medium text-gray-300 mb-1">Frecuencia</label>
                         <select name="frequency" value={newRecurringExpense.frequency} onChange={handleRecurringChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                            <option value="monthly">Mensual</option>
                            <option value="yearly">Anual</option>
                        </select>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit">Guardar Gasto Recurrente</Button>
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
            </Suspense>

        </div>
    );
};

export default ExpensesPage;