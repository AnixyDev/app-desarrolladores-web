import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../ui/Modal.tsx';
import Button from '../ui/Button.tsx';
import { useAppStore } from '../../hooks/useAppStore.tsx';
import { formatCurrency } from '../../lib/utils.ts';

interface InvoiceFromTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (clientId: string, projectId: string, timeEntryIds: string[]) => void;
}

const InvoiceFromTimeModal: React.FC<InvoiceFromTimeModalProps> = ({ isOpen, onClose, onGenerate }) => {
    const { clients, projects, timeEntries, profile } = useAppStore();
    
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    useEffect(() => {
        if (isOpen && clients.length > 0) {
            setSelectedClientId(clients[0].id);
        } else {
            setSelectedClientId('');
        }
    }, [isOpen, clients]);

    const clientProjects = useMemo(() => {
        return projects.filter(p => p.client_id === selectedClientId);
    }, [projects, selectedClientId]);

    useEffect(() => {
        if (clientProjects.length > 0) {
            setSelectedProjectId(clientProjects[0].id);
        } else {
            setSelectedProjectId('');
        }
    }, [clientProjects]);

    const unbilledData = useMemo(() => {
        if (!selectedProjectId) return { hours: 0, amount: 0, entryIds: [] };
        
        const unbilledEntries = timeEntries.filter(t => t.project_id === selectedProjectId && !t.invoice_id);
        const totalSeconds = unbilledEntries.reduce((sum, entry) => sum + entry.duration_seconds, 0);
        const totalHours = totalSeconds / 3600;
        const totalAmount = totalHours * profile.hourly_rate_cents;

        return {
            hours: totalHours,
            amount: totalAmount,
            entryIds: unbilledEntries.map(e => e.id)
        };
    }, [selectedProjectId, timeEntries, profile.hourly_rate_cents]);

    const handleGenerateClick = () => {
        if (selectedClientId && selectedProjectId && unbilledData.entryIds.length > 0) {
            onGenerate(selectedClientId, selectedProjectId, unbilledData.entryIds);
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generar Factura desde Horas Registradas">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
                    <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto</label>
                    <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white" disabled={clientProjects.length === 0}>
                        {clientProjects.length > 0 ? (
                            clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                        ) : (
                            <option>No hay proyectos para este cliente</option>
                        )}
                    </select>
                </div>
                
                {selectedProjectId && (
                     <div className="p-4 bg-gray-800/50 rounded-lg text-center mt-4">
                        <p className="text-sm text-gray-400">Horas sin facturar</p>
                        <p className="text-2xl font-bold text-white">{unbilledData.hours.toFixed(2)}h</p>
                        <p className="text-sm text-gray-400">Total a facturar</p>
                        <p className="text-2xl font-bold text-primary-400">{formatCurrency(unbilledData.amount)}</p>
                     </div>
                )}
                
                <div className="flex justify-end pt-4">
                    <Button onClick={handleGenerateClick} disabled={unbilledData.hours === 0}>
                        Generar Borrador de Factura
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default InvoiceFromTimeModal;