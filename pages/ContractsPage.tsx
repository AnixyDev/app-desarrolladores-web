// pages/ContractsPage.tsx
import React, { useState } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusChip from '@/components/ui/StatusChip';
import { Contract } from '@/types';
import { useToast } from '@/hooks/useToast';

import ContractFormModal from '@/components/contracts/ContractFormModal';
import ContractSignModal from '@/components/contracts/ContractSignModal';
import ContractActionsMenu from '@/components/contracts/ContractActionsMenu';

const ContractsPage: React.FC = () => {
  const {
    profile, contracts, clients, projects,
    addContract, updateContract, deleteContract, sendContract,
    getClientById, getProjectById,
  } = useAppStore();
  const { addToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSignOpen, setIsSignOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractToSign, setContractToSign] = useState<Contract | null>(null);

  // ── Handlers del formulario ────────────────────────────────────────────────

  const handleOpenCreate = () => { setEditingContract(null); setIsFormOpen(true); };
  const handleOpenEdit = (contract: Contract) => { setEditingContract(contract); setIsFormOpen(true); };

  const handleFormSubmit = ({ clientId, projectId, content }: { clientId: string; projectId: string; content: string }) => {
    if (editingContract) {
      updateContract(editingContract.id, { client_id: clientId, project_id: projectId, content });
      addToast('Contrato actualizado.', 'success');
    } else {
      addContract({ client_id: clientId, project_id: projectId, content, status: 'draft' });
      addToast('Contrato creado.', 'success');
    }
    setIsFormOpen(false);
  };

  // ── Handlers de firma ──────────────────────────────────────────────────────

  const handleOpenSign = (contract: Contract) => { setContractToSign(contract); setIsSignOpen(true); };

  const handleSign = (signerName: string, signedAt: string) => {
    if (!contractToSign) return;
    updateContract(contractToSign.id, {
      status: 'signed',
      signed_by: signerName,
      signed_at: new Date(signedAt).toISOString(),
    });
    addToast(`Contrato marcado como firmado por ${signerName}.`, 'success');
    setIsSignOpen(false);
    setContractToSign(null);
  };

  // ── Handlers de acciones ────────────────────────────────────────────────────

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este contrato?')) {
      deleteContract(id);
      addToast('Contrato eliminado.', 'info');
    }
  };

  const handleSend = (contract: Contract) => {
    const client = getClientById(contract.client_id);
    const project = getProjectById(contract.project_id);
    if (!client?.email || !project) {
      addToast('Faltan datos del cliente o del proyecto.', 'error');
      return;
    }
    sendContract(contract.id);
    addToast('Estado actualizado a Enviado.', 'success');
    const portalLink = `${window.location.origin}/portal/contracts/${contract.id}`;
    const subject = `Contrato para el proyecto "${project.name}"`;
    const body = `Hola ${client.name},\n\nTe envío el contrato para nuestro proyecto "${project.name}".\n\nPuedes revisarlo y firmarlo digitalmente aquí:\n${portalLink}\n\nSaludos,\n${profile.full_name}`;
    window.open(`mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  const handleDownload = (contract: Contract) => {
    const project = getProjectById(contract.project_id);
    import('jspdf').then(({ default: jsPDF }) => {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      doc.setFontSize(10);
      const splitText = doc.splitTextToSize(contract.content, pageWidth - margin * 2);
      doc.text(splitText, margin, 20);
      doc.save(`Contrato_${project?.name || 'Servicios'}.pdf`);
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-semibold text-white">Contratos</h1>
        <Button onClick={handleOpenCreate}>Crear Contrato</Button>
      </div>

      <Card>
        <CardContent className="p-4 md:p-0">

          {/* Vista móvil */}
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
                    <p className="flex justify-between">
                      <span>Creado:</span>
                      <span className="text-gray-200">{new Date(contract.created_at).toLocaleDateString()}</span>
                    </p>
                    {contract.status === 'signed' && (
                      <p className="flex justify-between">
                        <span>Firmado:</span>
                        <span className="text-green-400">{new Date(contract.signed_at || '').toLocaleDateString()}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end mt-4">
                    <ContractActionsMenu
                      contract={contract}
                      onSign={handleOpenSign}
                      onEdit={handleOpenEdit}
                      onDownload={handleDownload}
                      onSend={handleSend}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vista escritorio */}
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
                          <div className="text-xs text-green-500">
                            Firmado: {new Date(contract.signed_at || '').toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <StatusChip type="contract" status={contract.status} />
                      </td>
                      <td className="p-4 text-right">
                        <ContractActionsMenu
                          contract={contract}
                          onSign={handleOpenSign}
                          onEdit={handleOpenEdit}
                          onDownload={handleDownload}
                          onSend={handleSend}
                          onDelete={handleDelete}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ContractFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        editingContract={editingContract}
        clients={clients}
        projects={projects}
        profile={profile}
      />

      <ContractSignModal
        isOpen={isSignOpen}
        onClose={() => setIsSignOpen(false)}
        onSign={handleSign}
        contract={contractToSign}
        clients={clients}
      />
    </div>
  );
};

export default ContractsPage;
