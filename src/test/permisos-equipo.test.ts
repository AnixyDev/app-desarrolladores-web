import { describe, it, expect } from 'vitest';
import { puede, type AccionEquipo } from '../../lib/permisosEquipo';

/**
 * La pantalla esconde lo que la base de datos va a rechazar. La tabla de
 * abajo es la de la migración roles_del_equipo, que se comprobó en
 * producción el 26/09 con supabase/pruebas/roles-del-equipo.sql. Si se cambia
 * un permiso en un sitio y no en el otro, esto falla.
 */

const DUENO = 'dueno';
const YO = 'miembro';
const membresia = (role: string) => ({ role, ownerId: DUENO });

const TABLA: Record<string, Record<AccionEquipo, boolean>> = {
    Developer: { editarProyecto: false, borrarProyecto: false, borrarTarea: false, verHorasEquipo: false },
    Manager:   { editarProyecto: true,  borrarProyecto: false, borrarTarea: false, verHorasEquipo: true },
    Admin:     { editarProyecto: true,  borrarProyecto: false, borrarTarea: true,  verHorasEquipo: true },
};

describe('permisos de los roles del equipo sobre los datos del dueño', () => {
    for (const [rol, acciones] of Object.entries(TABLA)) {
        for (const [accion, esperado] of Object.entries(acciones)) {
            it(`${rol} → ${accion}: ${esperado ? 'sí' : 'no'}`, () => {
                expect(puede(accion as AccionEquipo, DUENO, YO, membresia(rol))).toBe(esperado);
            });
        }
    }
});

describe('fuera del equipo', () => {
    it('sobre lo propio, todo', () => {
        for (const a of ['editarProyecto', 'borrarProyecto', 'borrarTarea', 'verHorasEquipo'] as AccionEquipo[]) {
            expect(puede(a, YO, YO, null)).toBe(true);
            expect(puede(a, YO, YO, membresia('Developer'))).toBe(true);
        }
    });

    it('sobre datos de otra cuenta que no es mi equipo, nada', () => {
        expect(puede('editarProyecto', 'otra', YO, membresia('Admin'))).toBe(false);
        expect(puede('editarProyecto', 'otra', YO, null)).toBe(false);
    });

    it('un rol desconocido no da permisos', () => {
        expect(puede('editarProyecto', DUENO, YO, membresia('Jefe'))).toBe(false);
    });

    it('sin sesión, nada', () => {
        expect(puede('editarProyecto', DUENO, null, null)).toBe(false);
        expect(puede('editarProyecto', null, null, null)).toBe(false);
    });
});
