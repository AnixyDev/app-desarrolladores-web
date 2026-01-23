import React from 'react';

type StatusType = 'project' | 'invoice' | 'budget' | 'proposal' | 'contract';
type StatusValue = string; // e.g., 'in-progress', 'paid', 'pending', etc.

interface StatusChipProps {
  type: StatusType;
  status: StatusValue;
  dueDate?: string; // For invoices
}

const statusConfig = {
    project: {
        planning: { label: 'Planificación', className: 'bg-blue-500/20 text-blue-400' },
        'in-progress': { label: 'En Progreso', className: 'bg-purple-500/20 text-purple-400' },
        completed: { label: 'Completado', className: 'bg-green-500/20 text-green-400' },
        'on-hold': { label: 'En Pausa', className: 'bg-yellow-500/20 text-yellow-400' },
    },
    invoice: {
        paid: { label: 'Pagada', className: 'bg-green-500/20 text-green-400' },
        pending: { label: 'Pendiente', className: 'bg-yellow-500/20 text-yellow-400' },
        overdue: { label: 'Vencida', className: 'bg-red-500/20 text-red-400' },
    },
    budget: {
        pending: { label: 'Pendiente', className: 'bg-yellow-500/20 text-yellow-400' },
        accepted: { label: 'Aceptado', className: 'bg-green-500/20 text-green-400' },
        rejected: { label: 'Rechazado', className: 'bg-red-500/20 text-red-400' },
    },
    proposal: {
        draft: { label: 'Borrador', className: 'bg-gray-500/20 text-gray-400' },
        sent: { label: 'Enviada', className: 'bg-blue-500/20 text-blue-400' },
        accepted: { label: 'Aceptada', className: 'bg-green-500/20 text-green-400' },
        rejected: { label: 'Rechazada', className: 'bg-red-500/20 text-red-400' },
    },
    contract: {
        draft: { label: 'Borrador', className: 'bg-gray-500/20 text-gray-400' },
        sent: { label: 'Enviado', className: 'bg-blue-500/20 text-blue-400' },
        signed: { label: 'Firmado', className: 'bg-green-500/20 text-green-400' },
    },
};

const StatusChip: React.FC<StatusChipProps> = ({ type, status, dueDate }) => {
    let currentStatus = status;
    if (type === 'invoice' && status === 'pending' && dueDate) {
        const today = new Date();
        today.setHours(0,0,0,0);
        if (new Date(dueDate) < today) {
            currentStatus = 'overdue';
        }
    }

    const config = (statusConfig[type] as Record<string, {label: string; className: string;}>)?.[currentStatus];
    if (!config) {
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-700">{status}</span>;
    }

    return (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${config.className}`}>
            {config.label}
        </span>
    );
};

export default StatusChip;