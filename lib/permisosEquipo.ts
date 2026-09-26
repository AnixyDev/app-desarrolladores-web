/**
 * Qué puede hacer cada rol del equipo (plan Teams) sobre los datos del dueño.
 *
 * La regla de verdad vive en la base de datos (migración roles_del_equipo:
 * rol_en_equipo() y sus políticas). Esto es su copia para la pantalla: sirve
 * para no enseñar botones que la base de datos va a rechazar, no para
 * proteger nada. Si se cambia una, hay que cambiar la otra.
 *
 *                            Developer  Manager  Admin   Dueño
 *   Editar proyectos             —         ✓       ✓       ✓
 *   Borrar proyectos             —         —       —       ✓
 *   Borrar tareas                —         —       ✓       ✓
 *   Ver las horas del equipo     —         ✓       ✓       ✓
 */

export type RolEquipo = 'Developer' | 'Manager' | 'Admin';
export type AccionEquipo = 'editarProyecto' | 'borrarProyecto' | 'borrarTarea' | 'verHorasEquipo';

export interface MembresiaMinima {
    role: string;
    ownerId: string;
}

const PERMISOS: Record<RolEquipo, ReadonlySet<AccionEquipo>> = {
    Developer: new Set<AccionEquipo>([]),
    Manager: new Set<AccionEquipo>(['editarProyecto', 'verHorasEquipo']),
    Admin: new Set<AccionEquipo>(['editarProyecto', 'verHorasEquipo', 'borrarTarea']),
};

/**
 * @param idDelDuenoDelRegistro user_id del proyecto/tarea en cuestión.
 * @param miId id de la cuenta con sesión.
 * @param membresia pertenencia a un equipo (teamMembership del store), o null.
 */
export const puede = (
    accion: AccionEquipo,
    idDelDuenoDelRegistro: string | null | undefined,
    miId: string | null | undefined,
    membresia: MembresiaMinima | null | undefined,
): boolean => {
    // Lo propio, todo.
    if (idDelDuenoDelRegistro && miId && idDelDuenoDelRegistro === miId) return true;
    // Lo de un equipo del que soy miembro: según el rol.
    if (membresia && idDelDuenoDelRegistro === membresia.ownerId) {
        return PERMISOS[membresia.role as RolEquipo]?.has(accion) ?? false;
    }
    return false;
};
