import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ordenarHitos, resumenDeHitos, hitoAtrasado, fechaCorta, type Hito } from '../../lib/hitos';

/**
 * "Proyectos e Hitos ilimitados" se vendía en Pro y los hitos no existían.
 * Ahora: tabla project_milestones (permisos comprobados en producción con
 * supabase/pruebas/hitos-de-proyecto.sql) y este componente, que usan el
 * detalle del proyecto y el portal del cliente.
 */

const h = (p: Partial<Hito>): Hito => ({ id: p.id ?? Math.random().toString(), project_id: 'p1', title: 'x', due_date: null, status: 'pendiente', position: 0, ...p });

describe('lógica de hitos', () => {
    it('ordena por fecha, los sin fecha al final', () => {
        const r = ordenarHitos([h({ title: 'C', due_date: null }), h({ title: 'B', due_date: '2026-11-01' }), h({ title: 'A', due_date: '2026-10-01' })]);
        expect(r.map(x => x.title)).toEqual(['A', 'B', 'C']);
    });

    it('resumen', () => {
        expect(resumenDeHitos([])).toBe('Sin hitos');
        expect(resumenDeHitos([h({ status: 'entregado' }), h({}), h({ status: 'en_curso' })])).toBe('1 de 3 entregados');
    });

    it('con retraso: pasada la fecha y sin entregar; nunca si está entregado', () => {
        expect(hitoAtrasado(h({ due_date: '2026-09-20' }), '2026-09-26')).toBe(true);
        expect(hitoAtrasado(h({ due_date: '2026-09-26' }), '2026-09-26')).toBe(false); // vale todo el día
        expect(hitoAtrasado(h({ due_date: '2026-09-20', status: 'entregado' }), '2026-09-26')).toBe(false);
        expect(hitoAtrasado(h({ due_date: null }), '2026-09-26')).toBe(false);
    });

    it('fecha corta sin pasar por Date (no se mueve de día con el huso horario)', () => {
        expect(fechaCorta('2026-01-01')).toBe('01/01/2026');
        expect(fechaCorta(null)).toBe('Sin fecha');
    });
});

// --- Componente --------------------------------------------------------------

const db = vi.hoisted(() => {
    const filas: any[] = [];
    const insertado: any[] = [];
    const cadena = (resultado: () => any) => {
        const c: any = {
            select: () => c, eq: () => c, single: () => Promise.resolve(resultado()),
            then: (ok: any, ko: any) => Promise.resolve(resultado()).then(ok, ko),
        };
        return c;
    };
    const from = vi.fn(() => ({
        select: () => cadena(() => ({ data: filas, error: null })),
        insert: (fila: any) => { insertado.push(fila); return cadena(() => ({ data: { id: 'nuevo', status: 'pendiente', ...fila }, error: null })); },
        update: () => cadena(() => ({ error: null })),
        delete: () => cadena(() => ({ error: null })),
    }));
    return { filas, insertado, from };
});
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: db.from } }));

import HitosDelProyecto from '../../components/projects/HitosDelProyecto';

beforeEach(() => {
    db.filas.length = 0;
    db.insertado.length = 0;
    db.filas.push(
        { id: 'a', project_id: 'p1', title: 'Diseño aprobado', due_date: '2026-10-01', status: 'entregado', position: 0 },
        { id: 'b', project_id: 'p1', title: 'Entrega beta', due_date: '2026-11-01', status: 'en_curso', position: 1 },
    );
});

describe('<HitosDelProyecto>', () => {
    it('solo lectura (portal): lista y estado, sin formulario ni botones', async () => {
        render(<HitosDelProyecto projectId="p1" puedeEditar={false} />);
        expect(await screen.findByText('Diseño aprobado')).toBeInTheDocument();
        expect(screen.getByText('1 de 2 entregados')).toBeInTheDocument();
        expect(screen.getByText('En curso')).toBeInTheDocument();
        expect(screen.queryByLabelText('Nombre del hito')).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Borrar el hito/)).not.toBeInTheDocument();
    });

    it('editable: crea un hito sin mandar user_id (lo pone la base de datos)', async () => {
        render(<HitosDelProyecto projectId="p1" puedeEditar />);
        await screen.findByText('Entrega beta');
        fireEvent.change(screen.getByLabelText('Nombre del hito'), { target: { value: '  Puesta en producción ' } });
        fireEvent.change(screen.getByLabelText('Fecha del hito'), { target: { value: '2026-12-15' } });
        fireEvent.click(screen.getByRole('button', { name: /Añadir/ }));
        await waitFor(() => expect(db.insertado).toHaveLength(1));
        expect(db.insertado[0]).toEqual({ project_id: 'p1', title: 'Puesta en producción', due_date: '2026-12-15', position: 2 });
        expect(db.insertado[0]).not.toHaveProperty('user_id');
        expect(await screen.findByText('Puesta en producción')).toBeInTheDocument();
    });
});
