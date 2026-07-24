import React, { useState, useEffect } from 'react';
// FIX: Add .tsx extension to Icon import
import { ZapIcon, TrashIcon, SettingsIcon, PlusIcon, RefreshCwIcon, CheckCircleIcon, XCircleIcon } from '../components/icons/Icon';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/useToast';

// --- TYPES ---
interface Integration {
  id: string;
  name: string;
  url: string;
  event: string;
  isActive: boolean;
  lastTest: { success: boolean; timestamp: string } | null;
}

// Fila tal cual viene de Supabase (columnas en minúsculas/snake_case)
interface IntegrationRow {
  id: string;
  name: string;
  url: string;
  event: string;
  is_active: boolean;
  last_test_success: boolean | null;
  last_test_at: string | null;
}

const rowToIntegration = (row: IntegrationRow): Integration => ({
  id: row.id,
  name: row.name,
  url: row.url,
  event: row.event,
  isActive: row.is_active,
  lastTest: row.last_test_at
    ? { success: !!row.last_test_success, timestamp: new Date(row.last_test_at).toLocaleString() }
    : null,
});

const availableEvents = [
  { id: 'TASK_COMPLETED', name: 'Tarea Completada' },
  { id: 'NEW_DOCUMENT', name: 'Nuevo Documento Creado' },
  { id: 'TIMESHEET_SUBMITTED', name: 'Registro de Horas Enviado' },
];

const buttonStyle = 'px-3 py-2 text-sm font-semibold rounded-lg transition duration-200 flex items-center justify-center';

// --- CHILD COMPONENTS ---

const IntegrationCard: React.FC<{ integration: Integration; onDelete: (id: string) => void; onTest: (id: string) => void; testing: boolean; }> = ({ integration, onDelete, onTest, testing }) => {
  const isLastTestSuccessful = integration.lastTest?.success;

  return (
    <div className="bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700 hover:border-fuchsia-600 transition duration-300">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-bold text-white mb-1">{integration.name}</h3>
        <span className={`px-3 py-1 text-xs font-medium rounded-full ${integration.isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {integration.isActive ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      
      <p className="text-sm text-gray-400 mb-3 flex items-center">
        <ZapIcon className="w-4 h-4 mr-2 text-fuchsia-400" />
        Evento: <span className="font-medium ml-1 text-fuchsia-200">
            {availableEvents.find(e => e.id === integration.event)?.name || integration.event}
        </span>
      </p>

      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-400 block mb-1">URL del Webhook</label>
        <p className="text-sm bg-gray-900 p-2 rounded-lg text-gray-300 truncate">{integration.url}</p>
      </div>

      <div className="flex justify-between items-center text-xs text-gray-500 mb-4 border-t border-gray-700 pt-3">
        <div className="flex items-center">
            {integration.lastTest ? (
              isLastTestSuccessful
                ? <CheckCircleIcon className="w-4 h-4 mr-1 text-green-400" />
                : <XCircleIcon className="w-4 h-4 mr-1 text-red-400" />
            ) : null}
            <span className={integration.lastTest ? (isLastTestSuccessful ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}>
                {integration.lastTest ? `Último Test: ${isLastTestSuccessful ? 'Exitoso' : 'Fallido'}` : 'Sin probar todavía'}
            </span>
        </div>
        <span className="ml-4">{integration.lastTest?.timestamp}</span>
      </div>

      <div className="flex justify-end space-x-2">
        <button onClick={() => onTest(integration.id)} disabled={testing} className={`${buttonStyle} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>
          <RefreshCwIcon className={`w-4 h-4 mr-2 ${testing ? 'animate-spin' : ''}`} />Probar
        </button>
        <button onClick={() => onDelete(integration.id)} className={`${buttonStyle} bg-red-600 text-white hover:bg-red-700`}>
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const AddIntegrationForm: React.FC<{ onClose: () => void; onSave: (integration: Omit<Integration, 'id' | 'lastTest'>) => Promise<void>; }> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [event, setEvent] = useState(availableEvents[0].id);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url || !event) return;

    setSaving(true);
    await onSave({ name, url, event, isActive });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 p-6 rounded-xl w-full max-w-lg shadow-2xl border-t-4 border-fuchsia-600">
        <h2 className="text-2xl font-bold mb-6 text-white border-b border-gray-700 pb-2">Añadir Nueva Integración</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-fuchsia-500 outline-none" placeholder="Nombre de la Integración"/>
          <input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-fuchsia-500 outline-none" placeholder="URL del Webhook (Destino)"/>
          <select id="event" value={event} onChange={(e) => setEvent(e.target.value)} required className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-fuchsia-500 outline-none">
            {availableEvents.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </select>
          <div className="flex items-center">
            <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 text-fuchsia-600 bg-gray-700 border-gray-600 rounded focus:ring-fuchsia-500"/>
            <label htmlFor="isActive" className="ml-2 text-sm font-medium text-gray-300">Activo</label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className={`${buttonStyle} bg-gray-600 text-white hover:bg-gray-700`}>Cancelar</button>
            <button type="submit" disabled={saving} className={`${buttonStyle} bg-fuchsia-600 text-black hover:bg-fuchsia-700 disabled:opacity-50`}>
              <PlusIcon className="w-4 h-4 mr-2" />{saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
// FIX: esta página vivía enteramente en useState local — "Guardar" solo
// metía el objeto en memoria, así que al refrescar la página siempre volvía
// a estar vacía. Ahora persiste de verdad en la tabla `integrations`.
const IntegrationsManager: React.FC = () => {
  const { addToast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      addToast('No se pudieron cargar las integraciones.', 'error');
    } else if (data) {
      setIntegrations((data as IntegrationRow[]).map(rowToIntegration));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveIntegration = async (newIntegration: Omit<Integration, 'id' | 'lastTest'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      addToast('No se encontró sesión de usuario.', 'error');
      return;
    }

    const { data, error } = await supabase
      .from('integrations')
      .insert({
        user_id: user.id,
        name: newIntegration.name,
        url: newIntegration.url,
        event: newIntegration.event,
        is_active: newIntegration.isActive,
      })
      .select()
      .single();

    if (error || !data) {
      addToast('No se pudo guardar la integración.', 'error');
      return;
    }

    setIntegrations(prev => [rowToIntegration(data as IntegrationRow), ...prev]);
    addToast('Integración guardada.', 'success');
    setIsModalOpen(false);
  };

  const handleDeleteIntegration = async (id: string) => {
    const previous = integrations;
    setIntegrations(prev => prev.filter(i => i.id !== id));

    const { error } = await supabase.from('integrations').delete().eq('id', id);
    if (error) {
      setIntegrations(previous);
      addToast('No se pudo eliminar la integración.', 'error');
    }
  };
  
  const handleTestIntegration = async (id: string) => {
    setTestingId(id);
    try {
      // Comprobación real de alcanzabilidad del webhook (no simulada):
      // 'no-cors' porque el destino puede no devolver cabeceras CORS, así
      // que no podemos leer el código de estado — solo si la petición pudo
      // completarse en absoluto.
      const integration = integrations.find(i => i.id === id);
      if (!integration) return;

      let success = true;
      try {
        await fetch(integration.url, { method: 'POST', mode: 'no-cors' });
      } catch {
        success = false;
      }

      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from('integrations')
        .update({ last_test_success: success, last_test_at: timestamp })
        .eq('id', id);

      if (error) {
        addToast('No se pudo guardar el resultado del test.', 'error');
        return;
      }

      setIntegrations(prev => prev.map(i =>
        i.id === id ? { ...i, lastTest: { success, timestamp: new Date(timestamp).toLocaleString() } } : i
      ));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2"><SettingsIcon/> Gestor de Automatización</h1>
        <button onClick={() => setIsModalOpen(true)} className={`${buttonStyle} bg-fuchsia-600 text-black hover:bg-fuchsia-700`}>
          <PlusIcon className="w-4 h-4 mr-2" />Añadir Integración
        </button>
      </div>

      <p className="text-gray-400">Configura Webhooks para enviar notificaciones a servicios externos (Slack, etc.) cuando ocurran eventos en tu equipo.</p>

      {isLoading ? (
        <div className="text-center p-12 text-gray-500">Cargando integraciones...</div>
      ) : integrations.length === 0 ? (
        <div className="text-center p-12 bg-gray-900 rounded-xl border-2 border-dashed border-gray-700">
            <ZapIcon className="w-10 h-10 mx-auto text-gray-600 mb-3" />
            <p className="text-lg text-gray-500 font-semibold">No hay integraciones configuradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {integrations.map(integration => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onDelete={handleDeleteIntegration}
                  onTest={handleTestIntegration}
                  testing={testingId === integration.id}
                />
            ))}
        </div>
      )}

      {isModalOpen && <AddIntegrationForm onClose={() => setIsModalOpen(false)} onSave={handleSaveIntegration} />}
    </div>
  );
};

export default IntegrationsManager;