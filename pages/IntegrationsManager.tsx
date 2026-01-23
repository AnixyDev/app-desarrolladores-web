import React, { useState } from 'react';
// FIX: Add .tsx extension to Icon import
import { ZapIcon, LinkIcon, TrashIcon, SettingsIcon, PlusIcon, RefreshCwIcon, CheckCircleIcon, XCircleIcon } from '../components/icons/Icon.tsx';

// --- TYPES ---
interface Integration {
  id: string;
  name: string;
  url: string;
  event: string;
  isActive: boolean;
  lastTest: { success: boolean; timestamp: string } | null;
}

const availableEvents = [
  { id: 'TASK_COMPLETED', name: 'Tarea Completada' },
  { id: 'NEW_DOCUMENT', name: 'Nuevo Documento Creado' },
  { id: 'TIMESHEET_SUBMITTED', name: 'Registro de Horas Enviado' },
];

const buttonStyle = 'px-3 py-2 text-sm font-semibold rounded-lg transition duration-200 flex items-center justify-center';

// --- CHILD COMPONENTS ---

const IntegrationCard: React.FC<{ integration: Integration; onDelete: (id: string) => void; onTest: (id: string) => void; }> = ({ integration, onDelete, onTest }) => {
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
            {isLastTestSuccessful ? <CheckCircleIcon className="w-4 h-4 mr-1 text-green-400" /> : <XCircleIcon className="w-4 h-4 mr-1 text-red-400" />}
            <span className={isLastTestSuccessful ? 'text-green-400' : 'text-red-400'}>
                Último Test: {isLastTestSuccessful ? 'Exitoso' : 'Fallido'}
            </span>
        </div>
        <span className="ml-4">{integration.lastTest?.timestamp}</span>
      </div>

      <div className="flex justify-end space-x-2">
        <button onClick={() => onTest(integration.id)} className={`${buttonStyle} bg-blue-600 text-white hover:bg-blue-700`}>
          <RefreshCwIcon className="w-4 h-4 mr-2" />Probar
        </button>
        <button onClick={() => onDelete(integration.id)} className={`${buttonStyle} bg-red-600 text-white hover:bg-red-700`}>
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const AddIntegrationForm: React.FC<{ onClose: () => void; onSave: (integration: Integration) => void; }> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [event, setEvent] = useState(availableEvents[0].id);
  const [isActive, setIsActive] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url || !event) return;
    
    const newIntegration = { id: `int-${Date.now()}`, name, url, event, isActive, lastTest: null };
    onSave(newIntegration);
    onClose();
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
            <button type="submit" className={`${buttonStyle} bg-fuchsia-600 text-black hover:bg-fuchsia-700`}><PlusIcon className="w-4 h-4 mr-2" />Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
const IntegrationsManager: React.FC = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSaveIntegration = (newIntegration: Integration) => {
    setIntegrations([...integrations, newIntegration]);
  };

  const handleDeleteIntegration = (id: string) => {
    setIntegrations(integrations.filter(i => i.id !== id));
  };
  
  const handleTestIntegration = (id: string) => {
    const integrationToTest = integrations.find(i => i.id === id);
    if (!integrationToTest) return;

    setTimeout(() => {
        const success = Math.random() > 0.3;
        const updatedIntegrations = integrations.map(i => 
            i.id === id ? { ...i, lastTest: { success, timestamp: new Date().toLocaleString() } } : i
        );
        setIntegrations(updatedIntegrations);
    }, 1000); 
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

      {integrations.length === 0 ? (
        <div className="text-center p-12 bg-gray-900 rounded-xl border-2 border-dashed border-gray-700">
            <ZapIcon className="w-10 h-10 mx-auto text-gray-600 mb-3" />
            <p className="text-lg text-gray-500 font-semibold">No hay integraciones configuradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {integrations.map(integration => (
                <IntegrationCard key={integration.id} integration={integration} onDelete={handleDeleteIntegration} onTest={handleTestIntegration} />
            ))}
        </div>
      )}

      {isModalOpen && <AddIntegrationForm onClose={() => setIsModalOpen(false)} onSave={handleSaveIntegration} />}
    </div>
  );
};

export default IntegrationsManager;
