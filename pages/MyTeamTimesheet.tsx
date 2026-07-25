import React, { useState, useEffect, useMemo } from 'react';
import { Clock, CheckCircle, ListTodo, Calendar, Pause, Play, Plus, GitBranch } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { Task } from '@/types';


interface ManualEntry {
    project_id: string;
    description: string;
    hours: string;
    date: string;
    billable: boolean;
}

const MyTeamTimesheet: React.FC = () => {
  const { tasks, projects, timeEntries, addTimeEntry, toggleTask, teamMembership, activeTimer, startTimer, stopTimer } = useAppStore();
  const { addToast } = useToast();

  // NUEVO: el cronómetro ya no vive aquí — vive en el store global
  // (activeTimer), basado en un timestamp de inicio. Esta variable local
  // solo sirve para refrescar la pantalla cada segundo mientras se está en
  // esta página; el tiempo real siempre se recalcula desde activeTimer.startedAt,
  // así que sigue contando aunque se navegue a otra página y se vuelva.
  const [displayTick, setDisplayTick] = useState(0);

  useEffect(() => {
    if (!activeTimer) return;
    const interval = window.setInterval(() => setDisplayTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const elapsedTime = activeTimer ? Math.floor((Date.now() - activeTimer.startedAt) / 1000) : 0;
  // displayTick solo se usa para forzar el re-render cada segundo (arriba); no se lee directamente.
  void displayTick;

  // FIX: antes se mostraban TODAS las tareas/proyectos visibles por RLS
  // (propios + del equipo mezclados), sin distinguir de qué workspace son.
  // Esta página es específicamente la vista de "trabajo en el equipo de
  // otro", así que si hay una membresía activa, se filtra estrictamente a
  // los proyectos/tareas del dueño del equipo (teamMembership.ownerId).
  const scopedProjects = useMemo(() => {
    if (!teamMembership) return projects;
    return projects.filter(p => p.user_id === teamMembership.ownerId);
  }, [projects, teamMembership]);

  const scopedProjectIds = useMemo(() => new Set(scopedProjects.map(p => p.id)), [scopedProjects]);

  const scopedTimeEntries = useMemo(() => {
    if (!teamMembership) return timeEntries;
    return timeEntries.filter(t => scopedProjectIds.has(t.project_id));
  }, [timeEntries, teamMembership, scopedProjectIds]);

  const initialManualEntry: ManualEntry = {
      project_id: scopedProjects[0]?.id || '',
      description: '',
      hours: '',
      date: new Date().toISOString().slice(0, 10),
      billable: true
  };
  const [manualEntry, setManualEntry] = useState<ManualEntry>(initialManualEntry);

  const relevantTasks = useMemo(() => {
    if (!teamMembership) return tasks;
    return tasks.filter(t => scopedProjectIds.has(t.project_id));
  }, [tasks, teamMembership, scopedProjectIds]);

  const formatTime = (totalSeconds: number) => {
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const handleStart = (task: Task) => {
    if (activeTimer) return; // ya hay uno en marcha
    startTimer(task);
  };

  // Detiene el cronómetro y registra el tiempo — es la única forma de
  // pararlo. Cambiar de página, cerrar la pestaña o recargar NO lo para
  // (activeTimer se persiste en localStorage y se recalcula por timestamp).
  const handleStop = async () => {
    const description = activeTimer?.description;
    const result = await stopTimer();
    if (result.success) {
      addToast(`Tiempo registrado para "${description}"`, 'success');
    } else {
      addToast(result.message || 'No se pudo registrar el tiempo.', 'error');
    }
  };

  const handleManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEntry.project_id || !manualEntry.hours) {
        addToast('Por favor, selecciona un proyecto e introduce las horas.', 'error');
        return;
    };

    const duration_seconds = parseFloat(manualEntry.hours) * 3600;
    const entryDate = new Date(manualEntry.date);
    const start_time = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 9, 0, 0).toISOString();
    const end_time = new Date(new Date(start_time).getTime() + duration_seconds * 1000).toISOString();

    try {
      await addTimeEntry({
          project_id: manualEntry.project_id,
          description: manualEntry.description,
          start_time,
          end_time,
          duration_seconds,
          invoice_id: null,
      });
      addToast('Entrada manual añadida con éxito.', 'success');
      setManualEntry(initialManualEntry);
    } catch (err) {
      addToast((err as Error).message || 'No se pudo añadir la entrada.', 'error');
    }
  };
  
  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualEntry(prev => ({ ...prev, [name]: value }));
  };

  const buttonStyle = 'px-4 py-2 font-semibold rounded-lg transition duration-200 shadow-md shadow-fuchsia-500/30 flex items-center justify-center';

  const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
    const isThisTaskRunning = activeTimer?.taskId === task.id;
    const isDone = task.status === 'done' || task.status === 'completed';

    return (
      <div className={`bg-gray-800 p-4 rounded-xl shadow-lg border-l-4 ${isDone ? 'border-gray-500' : 'border-fuchsia-500'}`}>
        <div className="flex justify-between items-start">
          <h3 className={`font-semibold text-lg ${isDone ? 'text-gray-500 line-through' : 'text-white'}`}>{task.description}</h3>
          <button
            onClick={() => toggleTask(task.id)}
            className={`p-1 rounded-full transition-colors ${isDone ? 'bg-gray-700 text-gray-400 hover:text-white' : 'bg-green-700 text-white hover:bg-green-600'}`}
            aria-label={isDone ? 'Marcar como Pendiente' : 'Marcar como Completada'}
          >
            {isDone ? <ListTodo className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-1 flex items-center"><GitBranch className="w-4 h-4 mr-2" /> {scopedProjects.find(p => p.id === task.project_id)?.name}</p>

        {!isDone && (
          <div className="mt-4 pt-3 border-t border-gray-700 flex justify-end">
            <button
              onClick={() => isThisTaskRunning ? handleStop() : handleStart(task)}
              disabled={!!activeTimer && !isThisTaskRunning}
              className={`w-full ${buttonStyle} ${isThisTaskRunning ? 'bg-red-600 text-white hover:bg-red-700' : activeTimer ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-fuchsia-600 text-black hover:bg-fuchsia-700'}`}
            >
              {isThisTaskRunning ? <><Pause className="w-5 h-5 mr-2" /> Detener</> : <><Play className="w-5 h-5 mr-2" /> Iniciar Tiempo</>}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Clock className="w-7 h-7 text-fuchsia-500 mr-3" />
            Mi Tiempo y Tareas
          </h1>
          <p className="text-gray-400">
            {teamMembership
              ? `Registrando horas en el equipo de ${teamMembership.ownerBusinessName || teamMembership.ownerFullName || 'tu equipo'}.`
              : 'Tu centro de productividad como miembro del equipo.'}
          </p>
        </header>

        <div className="bg-gray-900 p-6 rounded-xl shadow-2xl mb-8 border border-gray-800">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <div className="mb-4 sm:mb-0">
              <p className="text-sm uppercase tracking-wider text-fuchsia-500 font-bold">Temporizador Global</p>
              <h2 className="text-4xl font-extrabold text-white mt-1">{formatTime(elapsedTime)}</h2>
              <p className="text-gray-400 text-sm mt-1">
                {activeTimer ? `Trabajando en: ${activeTimer.description}` : 'Selecciona una tarea para iniciar el tiempo.'}
              </p>
              {activeTimer && (
                <p className="text-xs text-gray-500 mt-1">Sigue contando aunque cambies de página — solo se para al pulsar "Detener y Registrar".</p>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={handleStop}
                disabled={!activeTimer}
                className={`${buttonStyle} ${!activeTimer ? 'bg-gray-700 text-gray-500' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/30'}`}
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
              {relevantTasks.filter(t => !(t.status === 'done' || t.status === 'completed')).map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
              {relevantTasks.filter(t => !(t.status === 'done' || t.status === 'completed')).length === 0 && <p className="text-gray-500 text-center py-4">¡No tienes tareas pendientes!</p>}
              <div className="mt-6 pt-4 border-t border-gray-800">
                <h3 className="text-lg font-semibold text-gray-500 mb-3">Completadas</h3>
                <div className="space-y-3">
                  {relevantTasks.filter(t => t.status === 'done' || t.status === 'completed').map(task => (
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
                        {scopedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                {scopedTimeEntries.map(entry => (
                  <div key={entry.id} className="p-3 bg-gray-800 rounded-lg flex justify-between items-center hover:bg-gray-700 transition duration-150">
                    <div>
                      <p className="text-sm font-medium text-white">{entry.description || 'Sin descripción'}</p>
                      <p className="text-xs text-gray-400 flex items-center"><GitBranch className="w-3 h-3 mr-1" /> {scopedProjects.find(p=>p.id === entry.project_id)?.name} | {new Date(entry.start_time).toLocaleDateString()}</p>
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