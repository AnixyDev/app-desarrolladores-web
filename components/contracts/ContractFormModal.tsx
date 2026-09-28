// components/contracts/ContractFormModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Contract, Client, Project, Profile } from '@/types';
import { generarContrato, huecosPendientes } from '@/lib/plantillaContrato';


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

  // Plantilla ajustada a la ley española (lib/plantillaContrato.ts), rellena
  // con los datos del perfil, del cliente y del proyecto.
  const generateTemplate = (clientId: string, projectId: string): string => {
    const project = projects.find(p => p.id === projectId);
    const client = clients.find(c => c.id === clientId);
    if (!project || !client) return '';
    const domicilio = [profile.fiscal_street, [profile.fiscal_postal_code, profile.fiscal_city].filter(Boolean).join(' '), profile.fiscal_province]
      .map(x => (x ?? '').trim()).filter(Boolean).join(', ');
    return generarContrato({
      freelancer: {
        nombre: profile.full_name,
        negocio: profile.business_name,
        nif: profile.tax_id,
        domicilio,
        email: profile.invoice_reply_to_email || profile.email,
      },
      cliente: {
        nombre: client.name,
        empresa: client.company,
        nif: client.tax_id,
        domicilio: client.address,
        email: client.email,
      },
      proyecto: {
        nombre: project.name,
        descripcion: project.description,
        fechaEntrega: project.due_date,
        importeCents: project.budget_cents,
      },
      lugar: profile.fiscal_city,
      fecha: new Date().toISOString().slice(0, 10),
    });
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
          <div className="flex items-center justify-between mb-1 gap-2">
            <label className="block text-sm font-medium text-gray-300">Contenido del Contrato</label>
            <button
              type="button"
              disabled={!selectedProjectId}
              onClick={() => {
                if (contractContent.trim() && !window.confirm('Se sustituirá el texto actual por la plantilla legal con los datos del cliente y del proyecto. ¿Continuar?')) return;
                setContractContent(generateTemplate(selectedClientId, selectedProjectId));
              }}
              className="text-xs text-primary-400 hover:text-primary-300 disabled:opacity-40"
            >
              Usar la plantilla legal
            </button>
          </div>
          <textarea
            value={contractContent}
            onChange={e => setContractContent(e.target.value)}
            className="w-full h-96 p-6 border border-gray-600 rounded-md bg-gray-100 text-gray-900 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Escribe o pega aquí el contenido del contrato..."
            disabled={!selectedProjectId}
          />
          {huecosPendientes(contractContent) > 0 && (
            <p className="text-xs text-yellow-300 mt-2">
              Faltan {huecosPendientes(contractContent)} dato(s) marcados como [________]. Complétalos aquí, o rellena tu domicilio fiscal y NIF en Ajustes y los del cliente en su ficha, y pulsa «Usar la plantilla legal».
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Plantilla orientativa conforme a la legislación española (Código Civil, Ley de Propiedad Intelectual, RGPD, Ley de morosidad y normas de consumo). Adáptala a cada caso y, si el proyecto es importante, pide que la revise un abogado.
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
