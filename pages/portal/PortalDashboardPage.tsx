import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { BriefcaseIcon, FileTextIcon } from '@/components/icons/Icon';
import { supabase } from '@/lib/supabaseClient';
import { Project, Invoice } from '@/types';

interface PortalContext {
  clientId: string;
}

const PortalDashboardPage: React.FC = () => {
  // 🆕 clientId viene del contexto que provee PortalLayout, no de la URL
  const { clientId } = useOutletContext<PortalContext>();

  const [clientName, setClientName] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;

    const loadPortalData = async () => {
      setLoading(true);

      const [clientRes, projectsRes, invoicesRes] = await Promise.all([
        supabase.from('clients').select('name').eq('id', clientId).single(),
        supabase.from('projects').select('*').eq('client_id', clientId).order('due_date', { ascending: true }),
        supabase.from('invoices').select('*').eq('client_id', clientId).order('issue_date', { ascending: false }),
      ]);

      if (clientRes.error || !clientRes.data) {
        setError('No se pudo cargar la información del cliente.');
        setLoading(false);
        return;
      }

      setClientName(clientRes.data.name);
      setProjects(projectsRes.data || []);
      setInvoices(invoicesRes.data || []);
      setLoading(false);
    };

    loadPortalData();
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Bienvenido, {clientName}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <BriefcaseIcon className="w-5 h-5" /> Mis Proyectos
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-800">
              {projects.length > 0 ? projects.map(p => (
                <li key={p.id} className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="text-sm text-gray-400">Vence: {p.due_date}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs capitalize bg-purple-500/20 text-purple-400">
                      {p.status}
                    </span>
                  </div>
                </li>
              )) : <p className="p-4 text-gray-400">No tienes proyectos activos.</p>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileTextIcon className="w-5 h-5" /> Mis Facturas
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-800">
              {invoices.length > 0 ? invoices.map(i => (
                <li key={i.id} className="p-4 hover:bg-gray-800/50">
                  {/* 🆕 la ruta real definida en routes.tsx es /portal/invoices/:id (plural) */}
                  <Link to={`/portal/invoices/${i.id}`} className="flex justify-between items-center">
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