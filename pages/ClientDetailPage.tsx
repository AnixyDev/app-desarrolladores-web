import React, { useState, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
// FIX: Remove .tsx extensions from imports to resolve module resolution errors.
import { useAppStore } from '../hooks/useAppStore';
import { formatCurrency } from '../lib/utils';
import { BriefcaseIcon, FileTextIcon, EditIcon, TrashIcon, PhoneIcon, MailIcon } from '../components/icons/Icon';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { Client, NewClient } from '../types';

const ClientIncomeChart = lazy(() => import('../components/charts/ClientIncomeChart'));

const ClientDetailPage: React.FC = () => {
    const { clientId } = useParams<{ clientId: string }>();
    const navigate = useNavigate();
    const { getClientById, projects, invoices, updateClient, deleteClient } = useAppStore();

    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const client = clientId ? getClientById(clientId) : undefined;
    const [formData, setFormData] = useState<Client | NewClient | null>(client || null);

    const clientProjects = projects.filter(p => p.client_id === clientId);
    const clientInvoices = invoices.filter(i => i.client_id === clientId);
    
    if (!client) {
        return <div className="text-center text-red-500">Cliente no encontrado.</div>;
    }
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => prev ? ({ ...prev, [name]: value }) : null);
    };

    const openEditModal = () => {
        setFormData(client);
        setIsModalOpen(true);
    }
    
    const closeModal = () => {
        setIsModalOpen(false);
    }
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData && 'id' in formData && formData.name && formData.email) {
            updateClient(formData as Client);
            closeModal();
        }
    };
    
    const handleDelete = () => {
        if (window.confirm('¿Estás seguro? Se eliminarán todos los datos asociados a este cliente (proyectos, facturas, etc.).')) {
            deleteClient(client.id);
            navigate('/clients');
        }
    }

    const totalBilled = clientInvoices
        .filter(i => i.paid)
        .reduce((sum, i) => sum + i.total_cents, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{client.name}</h1>
                    <p className="text-lg text-primary-400">{client.company}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button as="a" href={`mailto:${client.email}`} size="md" variant="secondary" title="Enviar Email" aria-label={`Enviar email a ${client.name}`}><MailIcon className="w-5 h-5" /></Button>
                    <Button as="a" href={`tel:${client.phone}`} size="md" variant="secondary" title="Llamar" aria-label={`Llamar a ${client.name}`}><PhoneIcon className="w-5 h-5" /></Button>
                    <Button onClick={openEditModal} size="md" variant="secondary" title="Editar" aria-label={`Editar cliente ${client.name}`}><EditIcon className="w-5 h-5" /></Button>
                    <Button onClick={handleDelete} size="md" variant="secondary" className="text-red-400 hover:bg-red-500/20 hover:text-red-300" title="Eliminar" aria-label={`Eliminar cliente ${client.name}`}><TrashIcon className="w-5 h-5" /></Button>
                </div>
            </div>


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                    <CardHeader><h2 className="text-lg font-semibold">Detalles de Contacto</h2></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div><p className="text-gray-400">Email</p><a href={`mailto:${client.email}`} className="text-white hover:underline">{client.email}</a></div>
                        {client.phone && <div><p className="text-gray-400">Teléfono</p><p className="text-white">{client.phone}</p></div>}
                        <div><p className="text-gray-400">Total Facturado (Pagado)</p><p className="text-white font-semibold text-lg">{formatCurrency(totalBilled)}</p></div>
                    </CardContent>
                </Card>

                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader><h2 className="text-lg font-semibold">Resumen de Ingresos</h2></CardHeader>
                        <CardContent>
                            <Suspense fallback={<div className="h-[300px] flex items-center justify-center text-gray-400">Cargando gráfico...</div>}>
                                <ClientIncomeChart invoices={clientInvoices} />
                            </Suspense>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><h2 className="text-lg font-semibold text-white flex items-center gap-2"><BriefcaseIcon className="w-5 h-5"/> Proyectos</h2></CardHeader>
                    <CardContent className="p-0">
                        <ul className="divide-y divide-gray-800">
                            {clientProjects.length > 0 ? clientProjects.map(p => (
                                <li key={p.id} className="p-4 hover:bg-gray-800/50">
                                    <Link to={`/projects/${p.id}`} className="flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold text-white">{p.name}</p>
                                            <p className="text-sm text-gray-400">Vence: {p.due_date}</p>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-full text-xs capitalize bg-purple-500/20 text-purple-400">{p.status}</span>
                                    </Link>
                                </li>
                            )) : <p className="p-4 text-gray-400">No hay proyectos para este cliente.</p>}
                        </ul>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><h2 className="text-lg font-semibold text-white flex items-center gap-2"><FileTextIcon className="w-5 h-5"/> Facturas</h2></CardHeader>
                    <CardContent className="p-0">
                        <ul className="divide-y divide-gray-800">
                             {clientInvoices.length > 0 ? clientInvoices.map(i => (
                                <li key={i.id} className="p-4 hover:bg-gray-800/50">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold text-white font-mono">{i.invoice_number}</p>
                                            <p className="text-sm text-gray-400">Emitida: {i.issue_date}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-white">{formatCurrency(i.total_cents)}</p>
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${i.paid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                {i.paid ? 'Pagada' : 'Pendiente'}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            )) : <p className="p-4 text-gray-400">No hay facturas para este cliente.</p>}
                        </ul>
                    </CardContent>
                </Card>
            </div>
             <Modal isOpen={isModalOpen} onClose={closeModal} title="Editar Cliente">
                {formData && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input name="name" label="Nombre Completo" value={formData.name} onChange={handleInputChange} required />
                    <Input name="company" label="Empresa (Opcional)" value={formData.company} onChange={handleInputChange} />
                    <Input name="email" label="Email" type="email" value={formData.email} onChange={handleInputChange} required />
                    <Input name="phone" label="Teléfono (Opcional)" value={formData.phone} onChange={handleInputChange} />
                    <div className="flex justify-end pt-4">
                        <Button type="submit">Guardar Cambios</Button>
                    </div>
                </form>
                )}
            </Modal>
        </div>
    );
};

export default ClientDetailPage;