import React, { useState, useEffect, useMemo } from 'react';
import { Clock, CheckCircle, ListTodo, Calendar, Pause, Play, Plus, GitBranch } from 'lucide-react';
import { useAppStore } from '../hooks/useAppStore.tsx';
import { useToast } from '../hooks/useToast.ts';
import { TimeEntry, Task } from '../types.ts';


interface ManualEntry {
    project_id: string;
    description: string;
    hours: string;
    date: string;
    billable: boolean;
}

const MyTeamTimesheet: React.FC = () => {
  const { tasks, projects, timeEntries, addTimeEntry, toggleTask } = useAppStore();
  const { addToast } = useToast();

  const [currentTimer, setCurrentTimer] = useState<Task | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  
  const initialManualEntry: ManualEntry = {
      project_id: projects[0]?.id || '',
      description: '',
      hours: '',
      date: new Date().toISOString().slice(0, 10),
      billable: true
  };
  const [manualEntry, setManualEntry] = useState<ManualEntry>(initialManualEntry);
  
  const relevantTasks = useMemo(() => {
    // En una app real, aquí se filtrarían las tareas asignadas al usuario actual
    return tasks;
  }, [tasks]);

  useEffect(() => {
    let interval: number | null = null;
    if (isRunning) {
      interval = window.setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  const formatTime = (totalSeconds: number) => {
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const toggleTimer = (task: Task | null = null) => {
    if (isRunning) {
      const duration_seconds = elapsedTime;
      if (currentTimer) {
        const start_time = new Date(Date.now() - duration_seconds * 1000).toISOString();
        const end_time = new Date().toISOString();
        addTimeEntry({
          project_id: currentTimer.project_id,
          description: currentTimer.description,
          start_time,
          end_time,
          duration_seconds,
          invoice_id: null
        });
        addToast(`Tiempo registrado para "${currentTimer.description}"`, 'success');
      }
      setIsRunning(false);
      setElapsedTime(0);
      setCurrentTimer(null);
    } else if (task) {
      setCurrentTimer(task);
      setIsRunning(true);
    }
  };

  const handleManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEntry.project_id || !manualEntry.hours) {
        addToast('Por favor, selecciona un proyecto e introduce las horas.', 'error');
        return;
    };

    const duration_seconds = parseFloat(manualEntry.hours) * 3600;
    const entryDate = new Date(manualEntry.date);
    const start_time = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 9, 0, 0).toISOString();
    const end_time = new Date(new Date(start_time).getTime() + duration_seconds * 1000).toISOString();

    addTimeEntry({
        project_id: manualEntry.project_id,
        description: manualEntry.description,
        start_time,
        end_time,
        duration_seconds,
        invoice_id: null,
    });
    addToast('Entrada manual añadida con éxito.', 'success');
    setManualEntry(initialManualEntry);
  };
  
  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualEntry(prev => ({ ...prev, [name]: value }));
  };

  const buttonStyle = 'px-4 py-2 font-semibold rounded-lg transition duration-200 shadow-md shadow-fuchsia-500/30 flex items-center justify-center';

  const TaskCard: React.FC<{ task: Task }> = ({ task }) => (
    <div className={`bg-gray-800 p-4 rounded-xl shadow-lg border-l-4 ${task.completed ? 'border-gray-500' : 'border-fuchsia-500'}`}>
      <div className="flex justify-between items-start">
        <h3 className={`font-semibold text-lg ${task.completed ? 'text-gray-500 line-through' : 'text-white'}`}>{task.description}</h3>
        <button 
          onClick={() => toggleTask(task.id)}
          className={`p-1 rounded-full transition-colors ${task.completed ? 'bg-gray-700 text-gray-400 hover:text-white' : 'bg-green-700 text-white hover:bg-green-600'}`}
          aria-label={task.completed ? 'Marcar como Pendiente' : 'Marcar como Completada'}
        >
          {task.completed ? <ListTodo className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
        </button>
      </div>
      <p className="text-sm text-gray-400 mt-1 flex items-center"><GitBranch className="w-4 h-4 mr-2" /> {projects.find(p => p.id === task.project_id)?.name}</p>
      
      {!task.completed && (
        <div className="mt-4 pt-3 border-t border-gray-700 flex justify-end">
          <button 
            onClick={() => toggleTimer(task)}
            disabled={isRunning && (!currentTimer || currentTimer.id !== task.id)}
            className={`w-full ${buttonStyle} ${isRunning && currentTimer?.id === task.id ? 'bg-red-600 text-white hover:bg-red-700' : isRunning ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-fuchsia-600 text-black hover:bg-fuchsia-700'}`}
          >
            {isRunning && currentTimer?.id === task.id ? <><Pause className="w-5 h-5 mr-2" /> Detener</> : <><Play className="w-5 h-5 mr-2" /> Iniciar Tiempo</>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Clock className="w-7 h-7 text-fuchsia-500 mr-3" />
            Mi Tiempo y Tareas
          </h1>
          <p className="text-gray-400">Tu centro de productividad como miembro del equipo.</p>
        </header>

        <div className="bg-gray-900 p-6 rounded-xl shadow-2xl mb-8 border border-gray-800">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <div className="mb-4 sm:mb-0">
              <p className="text-sm uppercase tracking-wider text-fuchsia-500 font-bold">Temporizador Global</p>
              <h2 className="text-4xl font-extrabold text-white mt-1">{formatTime(elapsedTime)}</h2>
              <p className="text-gray-400 text-sm mt-1">
                {currentTimer ? `Trabajando en: ${currentTimer.description}` : 'Selecciona una tarea para iniciar el tiempo.'}
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => toggleTimer(null)}
                disabled={!isRunning}
                className={`${buttonStyle} ${!isRunning ? 'bg-gray-700 text-gray-500' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/30'}`}
              >
                <Pause className="w-5 h-5 mr-2" />
                Detener y Registrar
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center"><ListTodo className="w-5 h-5 mr-2 text-fuchsia-500" /> Mis Tareas Asignadas</h2>
            <div className="space-y-4">
              {relevantTasks.filter(t => !t.completed).map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
              {relevantTasks.filter(t => !t.completed).length === 0 && <p className="text-gray-500 text-center py-4">¡No tienes tareas pendientes!</p>}
              <div className="mt-6 pt-4 border-t border-gray-800">
                <h3 className="text-lg font-semibold text-gray-500 mb-3">Completadas</h3>
                <div className="space-y-3">
                  {relevantTasks.filter(t => t.completed).map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <div className="bg-gray-900 p-6 rounded-xl shadow-xl mb-8 border border-gray-800">
              <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-800 pb-2 flex items-center"><Plus className="w-5 h-5 mr-2 text-fuchsia-500" /> Registro Manual de Tiempo</h2>
              <form onSubmit={handleManualEntry} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Proyecto</label>
                    <select name="project_id" value={manualEntry.project_id} onChange={handleManualInputChange} className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-fuchsia-500 outline-none" required>
                        <option value="" disabled>Selecciona un proyecto</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
                  <input name="description" type="text" value={manualEntry.description} onChange={handleManualInputChange} className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-fuchsia-500 outline-none" placeholder="Ej. Revisión de código" required/>
                </div>
                <div className="flex space-x-3">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Horas</label>
                        <input name="hours" type="number" step="0.1" min="0.1" value={manualEntry.hours} onChange={handleManualInputChange} className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-fuchsia-500 outline-none" required/>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Fecha</label>
                        <input name="date" type="date" value={manualEntry.date} onChange={handleManualInputChange} className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-fuchsia-500 outline-none" required/>
                    </div>
                </div>
                <button type="submit" className={`${buttonStyle} w-full bg-fuchsia-600 text-black hover:bg-fuchsia-700`}>
                  <Plus className="w-5 h-5 mr-2" />
                  Añadir Registro
                </button>
              </form>
            </div>

            <div className="bg-gray-900 p-6 rounded-xl shadow-xl border border-gray-800">
              <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-800 pb-2 flex items-center"><Calendar className="w-5 h-5 mr-2 text-fuchsia-500" /> Registros Recientes</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {timeEntries.map(entry => (
                  <div key={entry.id} className="p-3 bg-gray-800 rounded-lg flex justify-between items-center hover:bg-gray-700 transition duration-150">
                    <div>
                      <p className="text-sm font-medium text-white">{entry.description || 'Sin descripción'}</p>
                      <p className="text-xs text-gray-400 flex items-center"><GitBranch className="w-3 h-3 mr-1" /> {projects.find(p=>p.id === entry.project_id)?.name} | {new Date(entry.start_time).toLocaleDateString()}</p>
                    </div>
                    <span className="text-lg font-bold text-fuchsia-500">{(entry.duration_seconds/3600).toFixed(2)}h</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyTeamTimesheet;