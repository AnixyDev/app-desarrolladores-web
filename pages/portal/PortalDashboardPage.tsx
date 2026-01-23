import React from 'react';
import { Link, useParams } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { formatCurrency } from '../../lib/utils';
import { BriefcaseIcon, FileTextIcon } from '../../components/icons/Icon';

const PortalDashboardPage: React.FC = () => {
    const { clientId } = useParams<{ clientId: string }>();
    const { getClientById, projects, invoices } = useAppStore();

    const client = clientId ? getClientById(clientId) : undefined;
    const clientProjects = projects.filter(p => p.client_id === clientId);
    const clientInvoices = invoices.filter(i => i.client_id === clientId);

    if (!client) {
        return <div className="text-center text-red-500">Acceso no válido o cliente no encontrado.</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Bienvenido, {client.name}</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><h2 className="text-lg font-semibold text-white flex items-center gap-2"><BriefcaseIcon className="w-5 h-5"/> Mis Proyectos</h2></CardHeader>
                    <CardContent className="p-0">
                        <ul className="divide-y divide-gray-800">
                            {clientProjects.length > 0 ? clientProjects.map(p => (
                                <li key={p.id} className="p-4">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold text-white">{p.name}</p>
                                            <p className="text-sm text-gray-400">Vence: {p.due_date}</p>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-full text-xs capitalize bg-purple-500/20 text-purple-400">{p.status}</span>
                                    </div>
                                </li>
                            )) : <p className="p-4 text-gray-400">No tienes proyectos activos.</p>}
                        </ul>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><h2 className="text-lg font-semibold text-white flex items-center gap-2"><FileTextIcon className="w-5 h-5"/> Mis Facturas</h2></CardHeader>
                    <CardContent className="p-0">
                        <ul className="divide-y divide-gray-800">
                             {clientInvoices.length > 0 ? clientInvoices.map(i => (
                                <li key={i.id} className="p-4 hover:bg-gray-800/50">
                                    <Link to={`/portal/invoice/${i.id}`} className="flex justify-between items-center">
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
                                    </Link>
                                </li>
                            )) : <p className="p-4 text-gray-400">No tienes facturas.</p>}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default PortalDashboardPage;
