import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Project } from '@/types';
import { useAppStore } from '@/hooks/useAppStore';
import { AlertTriangleIcon, ChevronRightIcon } from '@/components/icons/Icon';

interface ProjectCardProps {
    project: Project;
    progress: number;
    clientName?: string;
    /** Se llama al tocar/hacer click en la tarjeta (no durante un arrastre). El padre decide la navegación. */
    onOpen?: (projectId: string) => void;
}

// Mismo color que la columna del Kanban a la que pertenece el estado — así
// la tarjeta se identifica de un vistazo también en la vista de lista/grid,
// donde no hay columnas que lo indiquen por posición.
const STATUS_BORDER_COLOR: Record<Project['status'], string> = {
    planning: 'border-l-blue-500',
    'in-progress': 'border-l-primary-500',
    'on-hold': 'border-l-orange-500',
    completed: 'border-l-green-500',
};

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, progress, clientName, onOpen }) => {
    const { timeEntries, profile } = useAppStore();

    // Rentabilidad: solo se usa para decidir si se muestra el aviso de "sobre presupuesto",
    // ya no hay una caja de cifras en la tarjeta — los números completos viven en el detalle.
    const projectHours = timeEntries
        .filter(t => t.project_id === project.id)
        .reduce((acc, curr) => acc + (curr.duration_seconds / 3600), 0);
    const costIncurredCents = Math.round(projectHours * (profile.hourly_rate_cents || 0));
    const budgetCents = project.budget_cents || 0;
    const isOverBudget = budgetCents > 0 && costIncurredCents > budgetCents;

    // Configuración Drag & Drop
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: project.id,
        data: { status: project.status }
    });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 1,
        // FIX: sin esto, en móvil el navegador interpreta el gesto de
        // "mantener pulsado y arrastrar" como una selección de texto nativa
        // (aparece el menú de copiar/compartir) en vez de dejar que dnd-kit
        // lo capture como drag. touchAction:'none' evita que el navegador se
        // adelante; WebkitUserSelect/WebkitTouchCallout quitan el menú
        // contextual de iOS al mantener pulsado.
        touchAction: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        userSelect: 'none',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onOpen?.(project.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onOpen?.(project.id);
            }}
            className={`group flex items-center gap-2 bg-gray-900 border border-gray-800 border-l-4 ${STATUS_BORDER_COLOR[project.status]} pl-3 pr-2 py-3 rounded-xl hover:border-primary-500/50 hover:bg-gray-800/60 transition-all cursor-grab active:cursor-grabbing shadow-lg mb-3`}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <p className="text-white font-semibold text-sm line-clamp-1">{project.name}</p>
                    {isOverBudget && (
                        <AlertTriangleIcon
                            className="w-3.5 h-3.5 text-red-400 shrink-0"
                            aria-label="Proyecto por encima de presupuesto"
                        />
                    )}
                </div>
                <p className="text-gray-500 text-xs truncate mt-0.5">{clientName || 'Sin cliente'}</p>
                <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden mt-2">
                    <div
                        className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-gray-700 group-hover:text-gray-500 transition-colors shrink-0" />
        </div>
    );
};