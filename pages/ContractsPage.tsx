
import React, { useState, useMemo } from 'react';
// FIX: Remove .tsx and .ts extensions from imports to fix module resolution errors.
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { Contract } from '../types';
import { formatCurrency } from '../lib/utils';
import { SendIcon, EditIcon, TrashIcon, DownloadIcon, CheckCircleIcon, SignatureIcon } from '../components/icons/Icon';
import StatusChip from '../components/ui/StatusChip';
import { useToast } from '../hooks/useToast';

const CONTRACT_TEMPLATE = `CONTRATO DE PRESTACIÓN DE SERVICIOS FREELANCE

Este contrato se celebra entre:

- [YOUR_NAME] (en adelante, "el Freelancer"), con NIF [YOUR_TAX_ID].
- [CLIENT_NAME], en representación de [CLIENT_COMPANY] (en adelante, "el Cliente").

Ambas partes acuerdan lo siguiente:

1. OBJETO DEL CONTRATO
El Freelancer se compromete a realizar los servicios profesionales para el proyecto "[PROJECT_NAME]".
Descripción del proyecto: [PROJECT_DESCRIPTION].

2. DURACIÓN Y ENTREGA
Este contrato entrará en vigor en la fecha de su firma. La fecha de entrega estimada para la finalización del proyecto es el [PROJECT_DUE_DATE].

3. HONORARIOS Y FORMA DE PAGO
El coste total de los servicios será de [PROJECT_BUDGET]. El pago se realizará según los plazos acordados en la factura correspondiente.

4. CONFIDENCIALIDAD
Ambas partes se comprometen a mantener la confidencialidad de toda la información compartida durante la duración de este contrato.

Firmado a [CURRENT_DATE].
`;

const ContractsPage: React.FC = () => {
    const { profile, contracts, clients, projects, addContract, updateContract, deleteContract, sendContract, getClientById, getProjectById } = useAppStore();
    const { addToast } = useToast();
    
    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    
    // Editing States
    const [editingContract, setEditingContract] = useState<Contract | null>(null);
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [contractContent, setContractContent] = useState('');

    // Signing States
    const [contractToSign, setContractToSign] = useState<Contract | null>(null);
    const [signData, setSignData] = useState({ signerName: '', signedAt: new Date().toISOString().split('T')[0] });

    const clientProjects = useMemo(() => projects.filter(p => p.client_id === selectedClientId), [projects, selectedClientId]);

    const generateTemplate = (clientId: string, projectId: string) => {
        const project = getProjectById(projectId);
        const client = getClientById(clientId);
        if (project && client && profile) {
            return CONTRACT_TEMPLATE
                .replace('[YOUR_NAME]', profile.full_name)
                .replace('[YOUR_TAX_ID]', profile.tax_id)
                .replace('[CLIENT_NAME]', client.name)
                .replace('[CLIENT_COMPANY]', client.company || client.name)
                .replace('[PROJECT_NAME]', project.name)
                .replace('[PROJECT_DESCRIPTION]', project.description || 'No especificada.')
                .replace('[PROJECT_DUE_DATE]', project.due_date)
                .replace('[PROJECT_BUDGET]', project.budget_cents ? formatCurrency(project.budget_cents) : 'a convenir')
                .replace('[CURRENT_DATE]', new Date().toLocaleDateString('es-ES'));
        }
        return '';
    };

    const handleOpenCreate = () => {
        setEditingContract(null);
        setContractContent('');
        if (clients.length > 0) {
            const firstClient = clients[0];
            setSelectedClientId(firstClient.id);
            const projs = projects.filter(p => p.client_id === firstClient.id);
            if (projs.length > 0) {
                setSelectedProjectId(projs[0].id);
                setContractContent(generateTemplate(firstClient.id, projs[0].id));
            } else {
                setSelectedProjectId('');
            }
        } else {
            setSelectedClientId('');
            setSelectedProjectId('');
        }
        setIsModalOpen(true);
    };

    const handleOpenEdit = (contract: Contract) => {
        setEditingContract(contract);
        setSelectedClientId(contract.client_id);
        setSelectedProjectId(contract.project_id);
        setContractContent(contract.content);
        setIsModalOpen(true);
    };

    const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const clientId = e.target.value;
        setSelectedClientId(clientId);
        
        const projs = projects.filter(p => p.client_id === clientId);
        if (projs.length > 0) {
            setSelectedProjectId(projs[0].id);
            if (!editingContract) {
                setContractContent(generateTemplate(clientId, projs[0].id));
            }
        } else {
            setSelectedProjectId('');
            if (!editingContract) {
                setContractContent('');
            }
        }
    };

    const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const projectId = e.target.value;
        setSelectedProjectId(projectId);
        if (!editingContract && projectId) {
            setContractContent(generateTemplate(selectedClientId, projectId));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedClientId && selectedProjectId && contractContent) {
            if (editingContract) {
                updateContract(editingContract.id, {
                    client_id: selectedClientId,
                    project_id: selectedProjectId,
                    content: contractContent
                });
                addToast('Contrato actualizado.', 'success');
            } else {
                addContract({
                    client_id: selectedClientId,
                    project_id: selectedProjectId,
                    content: contractContent,
                });
                addToast('Contrato creado.', 'success');
            }
            setIsModalOpen(false);
        }
    };

    const handleDelete = (id: string) => {
        if (window.confirm("¿Estás seguro de eliminar este contrato?")) {
            deleteContract(id);
            addToast('Contrato eliminado.', 'info');
        }
    };

    const handleSendEmail = (contract: Contract) => {
        const client = getClientById(contract.client_id);
        const project = getProjectById(contract.project_id);
        if (!client || !client.email || !project) {
            alert('Faltan datos del cliente o del proyecto para enviar el email.');
            return;
        }

        sendContract(contract.id);
        addToast('Estado actualizado a Enviado.', 'success');

        const portalLink = `${window.location.origin}${window.location.pathname}#/portal/contract/${contract.id}`;
        const subject = `Contrato para el proyecto "${project.name}"`;
        const body = `Hola ${client.name},\n\nTe envío el contrato para nuestro proyecto "${project.name}".\n\nPuedes revisarlo y firmarlo digitalmente a través del siguiente enlace seguro:\n${portalLink}\n\nQuedo a tu disposición para cualquier duda.\n\nSaludos,\n${profile.full_name}`;

        const mailtoLink = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink, '_blank');
    };

    const handleDownloadPdf = (contract: Contract) => {
        const project = getProjectById(contract.project_id);
        import('jspdf').then(({ default: jsPDF }) => {
            const doc = new jsPDF();
            doc.setFontSize(10);
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 15;
            const maxLineWidth = pageWidth - (margin * 2);
            const splitText = doc.splitTextToSize(contract.content, maxLineWidth);
            doc.text(splitText, margin, 20);
            doc.save(`Contrato_${project?.name || 'Servicios'}.pdf`);
        });
    };

    const handleOpenSign = (contract: Contract) => {
        const client = getClientById(contract.client_id);
        setContractToSign(contract);
        setSignData({
            signerName: client?.name || '',
            signedAt: new Date().toISOString().split('T')[0]
        });
        setIsSignModalOpen(true);
    };

    const handleSignSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (contractToSign && signData.signerName && signData.signedAt) {
            updateContract(contractToSign.id, {
                status: 'signed',
                signed_by: signData.signerName,
                signed_at: new Date(signData.signedAt).toISOString()
            });
            addToast(`Contrato marcado como firmado por ${signData.signerName}.`, 'success');
            setIsSignModalOpen(false);
            setContractToSign(null);
        }
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-semibold text-white">Contratos</h1>
                <Button onClick={handleOpenCreate}>Crear Contrato</Button>
            </div>

            <Card>
                <CardContent className="p-4 md:p-0">
                    {/* Mobile View */}
                    <div className="md:hidden space-y-4">
                        {contracts.map(contract => {
                            const project = getProjectById(contract.project_id);
                            const client = getClientById(contract.client_id);
                            return (
                                <div key={contract.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-semibold text-white pr-2">{project?.name}</p>
                                            <p className="text-sm text-gray-300">{client?.name}</p>
                                        </div>
                                        <StatusChip type="contract" status={contract.status} />
                                    </div>
                                    <div className="text-sm space-y-2 text-gray-400 border-t border-gray-700 pt-3 mt-3">
                                        <p className='flex justify-between'><span>Creado:</span> <span className="text-gray-200">{new Date(contract.created_at).toLocaleDateString()}</span></p>
                                        {contract.status === 'signed' && (
                                            <p className='flex justify-between'><span>Firmado:</span> <span className="text-green-400">{new Date(contract.signed_at || '').toLocaleDateString()}</span></p>
                                        )}
                                    </div>
                                    <div className="flex justify-end mt-4 gap-2 flex-wrap">
                                        {contract.status !== 'signed' && (
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenSign(contract)} title="Marcar como Firmado" className="text-green-400 hover:text-green-300">
                                                <CheckCircleIcon className="w-4 h-4" />
                                            </Button>
                                        )}
                                        {contract.status === 'draft' && (
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(contract)} title="Editar">
                                                <EditIcon className="w-4 h-4"/>
                                            </Button>
                                        )}
                                        <Button size="sm" variant="secondary" onClick={() => handleDownloadPdf(contract)} title="Descargar PDF">
                                            <DownloadIcon className="w-4 h-4"/>
                                        </Button>
                                        {contract.status === 'draft' && (
                                            <Button size="sm" variant="secondary" onClick={() => handleSendEmail(contract)} title="Enviar por Email">
                                                <SendIcon className="w-4 h-4" />
                                            </Button>
                                        )}
                                        {contract.status === 'draft' && (
                                            <Button size="sm" variant="danger" onClick={() => handleDelete(contract.id)} title="Eliminar">
                                                <TrashIcon className="w-4 h-4"/>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-800">
                                <tr>
                                    <th className="p-4 font-semibold whitespace-nowrap">Proyecto</th>
                                    <th className="p-4 font-semibold whitespace-nowrap">Cliente</th>
                                    <th className="p-4 font-semibold whitespace-nowrap">Fecha</th>
                                    <th className="p-4 font-semibold whitespace-nowrap">Estado</th>
                                    <th className="p-4 font-semibold whitespace-nowrap text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contracts.map(contract => {
                                    const project = getProjectById(contract.project_id);
                                    const client = getClientById(contract.client_id);
                                    return (
                                        <tr key={contract.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td className="p-4 text-white">{project?.name}</td>
                                            <td className="p-4 text-gray-300">{client?.name}</td>
                                            <td className="p-4 text-gray-300">
                                                <div>{new Date(contract.created_at).toLocaleDateString()}</div>
                                                {contract.status === 'signed' && (
                                                    <div className="text-xs text-green-500">Firmado: {new Date(contract.signed_at || '').toLocaleDateString()}</div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <StatusChip type="contract" status={contract.status} />
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {contract.status !== 'signed' && (
                                                        <Button size="sm" variant="secondary" onClick={() => handleOpenSign(contract)} title="Marcar como Firmado" className="text-green-400 hover:text-green-300 border-green-900/50">
                                                            <CheckCircleIcon className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    {contract.status === 'draft' && (
                                                        <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(contract)} title="Editar">
                                                            <EditIcon className="w-4 h-4"/>
                                                        </Button>
                                                    )}
                                                    <Button size="sm" variant="secondary" onClick={() => handleDownloadPdf(contract)} title="Descargar PDF">
                                                        <DownloadIcon className="w-4 h-4"/>
                                                    </Button>
                                                    {contract.status === 'draft' && (
                                                        <Button size="sm" variant="secondary" onClick={() => handleSendEmail(contract)} title="Enviar por Email">
                                                            <SendIcon className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    {contract.status === 'draft' && (
                                                        <Button size="sm" variant="danger" onClick={() => handleDelete(contract.id)} title="Eliminar">
                                                            <TrashIcon className="w-4 h-4"/>
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Modal de Edición/Creación */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingContract ? "Editar Contrato" : "Crear Nuevo Contrato"}>
                <form onSubmit={handleSubmit} className="space-y-4 max-h-[85vh] flex flex-col">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
                            <select value={selectedClientId} onChange={handleClientChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                                <option value="" disabled>Seleccionar Cliente</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto</label>
                            <select value={selectedProjectId} onChange={handleProjectChange} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white" disabled={clientProjects.length === 0}>
                                {clientProjects.length > 0 ? (
                                    clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                                ) : (
                                    <option value="">No hay proyectos para este cliente</option>
                                )}
                            </select>
                        </div>
                    </div>
                    <div className="flex-grow flex flex-col">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Contenido del Contrato</label>
                        <div className="flex-grow relative">
                            <textarea
                                value={contractContent}
                                onChange={e => setContractContent(e.target.value)}
                                className="w-full h-96 p-6 border border-gray-600 rounded-md shadow-inner bg-gray-100 text-gray-900 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Escribe o pega aquí el contenido del contrato..."
                                disabled={!selectedProjectId}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1 text-right">Este editor simula un documento. Puedes usar formato Markdown básico si lo deseas.</p>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={!selectedProjectId}>Guardar Contrato</Button>
                    </div>
                </form>
            </Modal>

            {/* Modal de Firma Manual */}
            <Modal isOpen={isSignModalOpen} onClose={() => setIsSignModalOpen(false)} title="Marcar como Firmado">
                <form onSubmit={handleSignSubmit} className="space-y-4">
                    <p className="text-sm text-gray-400">
                        Usa esta opción si el cliente ha firmado el contrato externamente o en papel y deseas registrarlo en el sistema.
                    </p>
                    <Input 
                        label="Nombre del Firmante" 
                        value={signData.signerName} 
                        onChange={e => setSignData({...signData, signerName: e.target.value})} 
                        required 
                    />
                    <Input 
                        label="Fecha de Firma" 
                        type="date" 
                        value={signData.signedAt} 
                        onChange={e => setSignData({...signData, signedAt: e.target.value})} 
                        required 
                    />
                    <div className="flex justify-end pt-4 gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsSignModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" className="bg-green-600 hover:bg-green-700">
                            <SignatureIcon className="w-4 h-4 mr-2" />
                            Confirmar Firma
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ContractsPage;
