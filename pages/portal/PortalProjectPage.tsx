import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import HitosDelProyecto from '@/components/projects/HitosDelProyecto';
import { BriefcaseIcon, MessageSquareIcon } from '@/components/icons/Icon';
import { supabase } from '@/lib/supabaseClient';
import { Project } from '@/types';

const ProjectChat = lazy(() => import('@/components/ProjectChat'));

/**
 * El proyecto visto por el cliente, con su canal de mensajes.
 *
 * Esta página no existía. "Canal de chat privado por proyecto" se vendía en el
 * plan Pro, pero el chat solo estaba en la pantalla del freelancer, guardaba
 * los mensajes en memoria y el cliente no tenía dónde leerlos ni responder:
 * no había nadie al otro lado. Esto es el otro lado.
 *
 * Qué puede ver el cliente aquí lo decide RLS, no este componente: la
 * política de `projects` le deja ver los proyectos de su propia ficha de
 * cliente, y la de `project_messages` los mensajes de esos proyectos.
 */

interface PortalContext {
  clientId: string;
}

const PortalProjectPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { clientId } = useOutletContext<PortalContext>();

  const [project, setProject] = useState<Project | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!projectId || !clientId) return;

    const cargar = async () => {
      setCargando(true);
      // Se filtra tambien por client_id: RLS ya lo impediría, pero así una
      // URL manipulada devuelve "no encontrado" en vez de un error de
      // permisos que confunde al cliente.
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('client_id', clientId)
        .maybeSingle();

      setProject((data as Project) ?? null);
      setCargando(false);
    };

    cargar();
  }, [projectId, clientId]);

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <p className="text-gray-300">Este proyecto no existe o no está disponible para ti.</p>
        <Link to="/portal/dashboard" className="text-primary-400 hover:underline">
          Volver a mis proyectos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/portal/dashboard" className="text-sm text-primary-400 hover:underline">
          ← Mis proyectos
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2 flex items-center gap-2">
          <BriefcaseIcon className="w-6 h-6" /> {project.name}
        </h1>
        {project.due_date && (
          <p className="text-sm text-gray-400 mt-1">Fecha de entrega: {project.due_date}</p>
        )}
      </div>

      {project.description && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Hitos</h2>
        </CardHeader>
        <CardContent>
          <HitosDelProyecto projectId={project.id} puedeEditar={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquareIcon className="w-5 h-5" /> Mensajes del proyecto
          </h2>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="h-[500px] flex items-center justify-center text-gray-400">
                Cargando mensajes…
              </div>
            }
          >
            <ProjectChat projectId={project.id} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalProjectPage;
