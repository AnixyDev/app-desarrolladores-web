// components/contracts/ContractFormModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Contract, Client, Project, Profile } from '@/types';
import { formatCurrency } from '@/lib/utils';

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

interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { clientId: string; projectId: string; content: string }) => void;
  editingContract: Contract | null;
  clients: Client[];
  projects: Project[];
  profile: Profile;
}

const ContractFormModal: React.FC<ContractFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingContract,
  clients,
  projects,
  profile,
}) => {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [contractContent, setContractContent] = useState('');

  const clientProjects = useMemo(
    () => projects.filter(p => p.client_id === selectedClientId),
    [projects, selectedClientId]
  );

  const generateTemplate = (clientId: string, projectId: string): string => {
    const project = projects.find(p => p.id === projectId);
    const client = clients.find(c => c.id === clientId);
    if (!project || !client) return '';
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
  };

  // Sync state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (editingContract) {
      setSelectedClientId(editingContract.client_id);
      setSelectedProjectId(editingContract.project_id);
      setContractContent(editingContract.content);
    } else {
      const firstClient = clients[0];
      if (firstClient) {
        const projs = projects.filter(p => p.client_id === firstClient.id);
        setSelectedClientId(firstClient.id);
        if (projs.length > 0) {
          setSelectedProjectId(projs[0].id);
          setContractContent(generateTemplate(firstClient.id, projs[0].id));
        } else {
          setSelectedProjectId('');
          setContractContent('');
        }
      } else {
        setSelectedClientId('');
        setSelectedProjectId('');
        setContractContent('');
      }
    }
  }, [isOpen, editingContract]);

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const clientId = e.target.value;
    setSelectedClientId(clientId);
    const projs = projects.filter(p => p.client_id === clientId);
    if (projs.length > 0) {
      setSelectedProjectId(projs[0].id);
      if (!editingContract) setContractContent(generateTemplate(clientId, projs[0].id));
    } else {
      setSelectedProjectId('');
      if (!editingContract) setContractContent('');
    }
  };

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value;
    setSelectedProjectId(projectId);
    if (!editingContract && projectId) setContractContent(generateTemplate(selectedClientId, projectId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClientId && selectedProjectId && contractContent) {
      onSubmit({ clientId: selectedClientId, projectId: selectedProjectId, content: contractContent });
    }
  };

  const selectClass = 'block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingContract ? 'Editar Contrato' : 'Crear Nuevo Contrato'}
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[85vh] flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
            <select value={selectedClientId} onChange={handleClientChange} className={selectClass}>
              <option value="" disabled>Seleccionar cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto</label>
            <select
              value={selectedProjectId}
              onChange={handleProjectChange}
              className={selectClass}
              disabled={clientProjects.length === 0}
            >
              {clientProjects.length > 0
                ? clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                : <option value="">No hay proyectos para este cliente</option>
              }
            </select>
          </div>
        </div>

        <div className="flex-grow flex flex-col">
          <label className="block text-sm font-medium text-gray-300 mb-1">Contenido del Contrato</label>
          <textarea
            value={contractContent}
            onChange={e => setContractContent(e.target.value)}
            className="w-full h-96 p-6 border border-gray-600 rounded-md bg-gray-100 text-gray-900 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Escribe o pega aquí el contenido del contrato..."
            disabled={!selectedProjectId}
          />
          <p className="text-xs text-gray-500 mt-1 text-right">
            Puedes usar formato Markdown básico si lo deseas.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="mr-2">
            Cancelar
          </Button>
          <Button type="submit" disabled={!selectedProjectId}>
            Guardar Contrato
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ContractFormModal;
