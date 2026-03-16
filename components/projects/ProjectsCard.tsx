import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Project } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useAppStore } from '@/hooks/useAppStore';
import { BriefcaseIcon, ClockIcon } from '@/components/icons/Icon';
import StatusChip from '@/components/ui/StatusChip';
import { Link } from 'react-router-dom';

interface ProjectCardProps {
    project: Project;
    progress: number;
    clientName?: string;
    compact?: boolean;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, progress, clientName, compact }) => {
    const { timeEntries, profile } = useAppStore();

    // Lógica de Rentabilidad
    const projectHours = timeEntries
        .filter(t => t.project_id === project.id)
        .reduce((acc, curr) => acc + (curr.duration_seconds / 3600), 0);
    
    const costIncurredCents = Math.round(projectHours * (profile.hourly_rate_cents || 0));
    const budgetCents = project.budget_cents || 0;
    const isProfitable = budgetCents === 0 || budgetCents > costIncurredCents;

    // Configuración Drag & Drop
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: project.id,
        data: { status: project.status }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 1,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            {...attributes} 
            {...listeners}
            className={`group bg-gray-900 border border-gray-800 p-4 rounded-2xl hover:border-primary-500/50 transition-all cursor-grab active:cursor-grabbing shadow-lg mb-4`}
        >
            <div className="flex justify-between items-start mb-3">
                <StatusChip type="project" status={project.status} />
                {budgetCents > 0 && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${isProfitable ? 'text-primary-300 bg-primary-500/10 border-primary-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                        {formatCurrency(budgetCents)}
                    </span>
                )}
            </div>

            <Link 
                to={`/projects/${project.id}`} 
                onPointerDown={(e) => e.stopPropagation()} // Para que el link funcione con DND
                className="text-white font-semibold text-sm line-clamp-1 mb-1 group-hover:text-primary-400 transition-colors"
            >
                {project.name}
            </Link>
            
            <p className="text-gray-500 text-xs mb-3 flex items-center gap-1 font-medium">
                <BriefcaseIcon className="w-3 h-3" /> {clientName || 'Sin cliente'}
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-2 rounded-xl bg-gray-800/40 border border-gray-700/50">
                    <p className="text-[9px] text-gray-500 uppercase font-bold">Invertido</p>
                    <p className="text-xs font-bold text-gray-200 flex items-center gap-1">
                        <ClockIcon className="w-3 h-3 text-primary-400" /> {projectHours.toFixed(1)}h
                    </p>
                </div>
                <div className={`p-2 rounded-xl border ${isProfitable ? 'bg-green-500/5 border-green-500/10' : 'bg-red-500/5 border-red-500/10'}`}>
                    <p className="text-[9px] text-gray-500 uppercase font-bold">Estado Fin.</p>
                    <p className={`text-xs font-bold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                        {isProfitable ? 'En margen' : 'Excedido'}
                    </p>
                </div>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase text-gray-500">
                    <span>Progreso</span>
                    <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
};