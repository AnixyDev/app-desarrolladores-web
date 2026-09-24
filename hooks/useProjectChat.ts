import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/loggerService';
import { ProjectMessage } from '@/types';

/**
 * El canal de mensajes de un proyecto, compartido por las dos partes.
 *
 * Lo usan la pantalla del freelancer (ProjectChat dentro de ProjectDetailPage)
 * y la del cliente (PortalProjectPage). Un solo sitio para las dos, porque son
 * la misma conversación vista desde cada lado.
 *
 * ANTES no existía nada de esto: ProjectChat guardaba los mensajes en un
 * `useState`, no tocaba Supabase, no había tabla, y el portal del cliente no
 * tenía chat. Se escribía un mensaje, se borraba al refrescar, y no había
 * nadie al otro lado — pero "Canal de chat privado por proyecto" se anunciaba
 * en el plan Pro.
 *
 * Quién puede leer y escribir lo decide RLS (dueño del proyecto, miembro
 * activo de su equipo, o el cliente del portal enlazado). Aquí no se
 * comprueba nada de eso: si alguien no tiene permiso, sencillamente no le
 * llegan filas.
 */

export const LIMITE_CARACTERES = 4000;

interface EstadoDelChat {
  mensajes: ProjectMessage[];
  cargando: boolean;
  error: string | null;
  enviando: boolean;
  enviar: (texto: string) => Promise<boolean>;
  recargar: () => Promise<void>;
}

export function useProjectChat(projectId: string | null | undefined): EstadoDelChat {
  const [mensajes, setMensajes] = useState<ProjectMessage[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Evita que una respuesta tardía de una carga anterior pise a la actual
  // cuando se cambia de proyecto.
  const proyectoVigente = useRef<string | null | undefined>(projectId);

  const cargar = useCallback(async () => {
    if (!projectId) {
      setMensajes([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const { data, error: fallo } = await supabase
      .from('project_messages')
      .select('id, project_id, author_id, author_name, author_role, body, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (proyectoVigente.current !== projectId) return;

    if (fallo) {
      logger.error('No se pudieron cargar los mensajes del proyecto', { motivo: fallo.message });
      setError('No se pudieron cargar los mensajes.');
      setMensajes([]);
    } else {
      setError(null);
      setMensajes((data ?? []) as ProjectMessage[]);
    }
    setCargando(false);
  }, [projectId]);

  useEffect(() => {
    proyectoVigente.current = projectId;
    cargar();

    if (!projectId) return;

    // Tiempo real: la tabla está en la publicación `supabase_realtime`, así
    // que el mensaje del otro lado aparece sin recargar.
    const canal = supabase
      .channel(`project_messages:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const nuevo = payload.new as ProjectMessage;
          setMensajes((previos) =>
            // Puede llegar por realtime algo que ya se añadió al enviar.
            previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo]
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'project_messages',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const borrado = payload.old as { id?: string };
          if (!borrado?.id) return;
          setMensajes((previos) => previos.filter((m) => m.id !== borrado.id));
        }
      )
      .subscribe();

    return () => {
      proyectoVigente.current = null;
      supabase.removeChannel(canal);
    };
  }, [projectId, cargar]);

  const enviar = useCallback(
    async (texto: string): Promise<boolean> => {
      const cuerpo = texto.trim();
      if (!projectId || cuerpo.length === 0) return false;
      if (cuerpo.length > LIMITE_CARACTERES) {
        setError(`El mensaje no puede pasar de ${LIMITE_CARACTERES} caracteres.`);
        return false;
      }

      setEnviando(true);
      // Solo se mandan proyecto y texto. El autor, su nombre y su rol los
      // rellena el trigger en la base de datos.
      const { data, error: fallo } = await supabase
        .from('project_messages')
        .insert({ project_id: projectId, body: cuerpo })
        .select('id, project_id, author_id, author_name, author_role, body, created_at')
        .single();

      setEnviando(false);

      if (fallo || !data) {
        logger.error('No se pudo enviar el mensaje', { motivo: fallo?.message });
        setError('No se pudo enviar el mensaje. Inténtalo de nuevo.');
        return false;
      }

      setError(null);
      const enviado = data as ProjectMessage;
      setMensajes((previos) =>
        previos.some((m) => m.id === enviado.id) ? previos : [...previos, enviado]
      );
      return true;
    },
    [projectId]
  );

  return { mensajes, cargando, error, enviando, enviar, recargar: cargar };
}
