import React, { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
// FIX: Remove .tsx and .ts extensions from imports to resolve module resolution errors.
import { useAppStore } from '@/hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { Client, NewClient, TipoFiscalCliente } from '@/types';
// FIX: Aliased Users to UsersIcon to match usage.
import { EditIcon, TrashIcon, PhoneIcon, MailIcon, Users as UsersIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import EmptyState from '@/components/ui/EmptyState';
import { TIPOS_FISCALES, normalizarNifIva, nifIvaValido } from '@/lib/ivaClientes';
import { borrarClienteConConfirmacion } from '@/lib/borrarCliente';

const UpgradePromptModal = lazy(() => import('@/components/modals/UpgradePromptModal'));


const initialClientState: NewClient = {
    name: '',
    company: '',
    email: '',
    phone: '',
    tax_id: '',
    address: '',
    tipo_fiscal: 'nacional',
    nif_iva: '',
};

const ClientsPage: React.FC = () => {
    const { clients, addClient, updateClient, deleteClient, profile, invoices, projects, fiscalRecords, getClientById } = useAppStore(useShallow(s => ({ clients: s.clients, addClient: s.addClient, updateClient: s.updateClient, deleteClient: s.deleteClient, profile: s.profile, invoices: s.invoices, projects: s.projects, fiscalRecords: s.fiscalRecords, getClientById: s.getClientById })));
    const { addToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [formData, setFormData] = useState<NewClient | Client>(initialClientState);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    // FIX: estado de guardado para bloquear el botón y evitar doble submit
    // mientras la llamada a Supabase está en curso.
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenAddModal = () => {
        if (profile.plan === 'Free' && clients.length >= 1) {
            setIsUpgradeModalOpen(true);
        } else {
            setEditingClient(null);
            setFormData(initialClientState);
            setIsModalOpen(true);
        }
    };

    const openEditModal = (client: Client) => {
        setEditingClient(client);
        setFormData(client);
        setIsModalOpen(true);
    }

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingClient(null);
        setFormData(initialClientState);
    }

    // FIX: handleSubmit ahora es async y espera (await) el resultado real
    // de addClient/updateClient. Antes se mostraba el toast de éxito y se
    // cerraba el modal de forma optimista sin comprobar si la escritura en
    // Supabase había funcionado, por lo que un error de base de datos
    // (p. ej. una columna inexistente) quedaba oculto en console.error y
    // el usuario veía "éxito" aunque no se hubiera guardado nada.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.email) return;

        // El NIF-IVA solo se guarda para empresas de la UE, donde es obligatorio
        // (sin él no se puede facturar sin IVA). Un cliente de fuera de la UE
        // usa el campo NIF/CIF para su número fiscal.
        const tipoFiscal: TipoFiscalCliente = formData.tipo_fiscal ?? 'nacional';
        const nifIva = tipoFiscal === 'empresa_ue' ? normalizarNifIva(formData.nif_iva) : null;
        if (tipoFiscal === 'empresa_ue' && !nifIva) {
            addToast('Indica el NIF-IVA de la empresa (por ejemplo, DE123456789).', 'error');
            return;
        }
        if (nifIva && !nifIvaValido(nifIva)) {
            addToast('El NIF-IVA debe empezar por el código del país (por ejemplo, FR12345678901).', 'error');
            return;
        }
        const datos = { ...formData, tipo_fiscal: tipoFiscal, nif_iva: nifIva };

        setIsSaving(true);
        try {
            if (editingClient) {
                await updateClient(datos as Client);
                addToast('Cliente actualizado con éxito', 'success');
            } else {
                const created = await addClient(datos as NewClient);
                if (!created) {
                    // addClient devuelve null si algo falló en el store.
                    throw new Error('No se pudo crear el cliente');
                }
                addToast('Cliente añadido con éxito', 'success');
            }
            closeModal();
        } catch (error) {
            console.error('Error guardando cliente:', error);
            addToast('No se pudo guardar el cliente. Inténtalo de nuevo.', 'error');
            // Importante: NO cerramos el modal ni reseteamos formData aquí,
            // así el usuario no pierde lo que había escrito.
        } finally {
            setIsSaving(false);
        }
    };

    // Con facturas no se borra (hay que conservarlas): ver lib/borrarCliente.ts.
    const handleDelete = (client: Client) => borrarClienteConConfirmacion({
        cliente: client,
        facturas: invoices.filter(i => i.client_id === client.id),
        proyectos: projects.filter(p => p.client_id === client.id).length,
        borrar: deleteClient,
        avisar: addToast,
        perfil: profile,
        registrosFiscales: fiscalRecords ?? [],
        clientePorId: getClientById,
    });

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-semibold text-white">Clientes</h1>
                <Button onClick={handleOpenAddModal}>Añadir Cliente</Button>
            </div>

            {clients.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {clients.map(client => (
                        <Card key={client.id} className="flex flex-col">
                            <CardHeader>
                                <Link to={`/clients/${client.id}`} className="text-primary-400 text-lg font-semibold hover:underline">
                                    {client.name}
                                </Link>
                                <p className="text-sm text-gray-400">{client.company}</p>
                            </CardHeader>
                            <CardContent className="flex-grow space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <MailIcon className="w-4 h-4 text-gray-500" />
                                    <span className="text-gray-300">{client.email}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <PhoneIcon className="w-4 h-4 text-gray-500" />
                                    <span className="text-gray-300">{client.phone || 'Sin teléfono'}</span>
                                </div>
                            </CardContent>
                            <div className="p-4 border-t border-gray-800 flex items-center justify-end gap-2">
                                <Button as="a" href={`mailto:${client.email}`} size="sm" variant="secondary" title="Enviar Email" aria-label={`Enviar email a ${client.name}`}><MailIcon className="w-4 h-4" /></Button>
                                <Button as="a" href={`tel:${client.phone}`} size="sm" variant="secondary" title="Llamar" aria-label={`Llamar a ${client.name}`}><PhoneIcon className="w-4 h-4" /></Button>
                                <Button onClick={() => openEditModal(client)} size="sm" variant="secondary" title="Editar" aria-label={`Editar cliente ${client.name}`}><EditIcon className="w-4 h-4" /></Button>
                                <Button onClick={() => handleDelete(client)} size="sm" variant="danger" title="Eliminar" aria-label={`Eliminar cliente ${client.name}`}><TrashIcon className="w-4 h-4" /></Button>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={UsersIcon}
                    title="No tienes clientes"
                    message="Aún no has añadido ningún cliente. ¡Empieza por añadir el primero para organizar tus proyectos!"
                    action={{ text: 'Añadir Cliente', onClick: handleOpenAddModal }}
                />
            )}


            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingClient ? "Editar Cliente" : "Añadir Nuevo Cliente"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input name="name" label="Nombre Completo" value={formData.name} onChange={handleInputChange} required />
                    <Input name="company" label="Empresa (Opcional)" value={formData.company} onChange={handleInputChange} />
                    <Input name="tax_id" label="NIF/CIF (Opcional)" value={formData.tax_id || ''} onChange={handleInputChange} placeholder="Ej: B12345678" />
                    <Input name="email" label="Email" type="email" value={formData.email} onChange={handleInputChange} required />
                    <Input name="phone" label="Teléfono (Opcional)" value={formData.phone} onChange={handleInputChange} />
                    <Input name="address" label="Dirección (Opcional)" value={formData.address || ''} onChange={handleInputChange} />
                    <div>
                        <label htmlFor="tipo_fiscal" className="block text-sm text-gray-400 mb-1">¿Dónde está el cliente?</label>
                        <select
                            id="tipo_fiscal"
                            name="tipo_fiscal"
                            value={formData.tipo_fiscal ?? 'nacional'}
                            onChange={handleInputChange}
                            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                            {TIPOS_FISCALES.map(t => (
                                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            {TIPOS_FISCALES.find(t => t.valor === (formData.tipo_fiscal ?? 'nacional'))?.ayuda}
                        </p>
                    </div>
                    {formData.tipo_fiscal === 'empresa_ue' && (
                        <Input
                            name="nif_iva"
                            label="NIF-IVA europeo"
                            value={formData.nif_iva || ''}
                            onChange={handleInputChange}
                            placeholder="Ej: DE123456789"
                            required
                        />
                    )}
                    <div className="flex justify-end pt-4">
                        <Button type="submit" isLoading={isSaving} disabled={isSaving}>
                            {isSaving ? 'Guardando...' : 'Guardar Cliente'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <Suspense fallback={null}>
                {isUpgradeModalOpen && (
                    <UpgradePromptModal
                        isOpen={isUpgradeModalOpen}
                        onClose={() => setIsUpgradeModalOpen(false)}
                        featureName="clientes"
                    />
                )}
            </Suspense>
        </div>
    );
};

export default ClientsPage;