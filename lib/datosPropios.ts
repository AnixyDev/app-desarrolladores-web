// Pantallas de trabajo: solo lo que es de esta cuenta (30/09/2026).
//
// La RLS de proyectos deja leer también los proyectos en los que uno figura
// como CLIENTE del portal de otro freelancer (para el portal). En las
// pantallas de trabajo esos proyectos ajenos no pintan nada: se quitan los
// que no son propios y cuyo cliente es una ficha enlazada a esta cuenta.
// Los del equipo del que se es miembro se mantienen.
import type { Project } from '@/types';

export function proyectosDeTrabajo(proyectos: Project[], uid: string, fichasComoCliente: Set<string>): Project[] {
  return proyectos.filter(p => p.user_id === uid || !fichasComoCliente.has(p.client_id));
}
