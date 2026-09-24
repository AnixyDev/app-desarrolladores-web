import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// "Canal de chat privado por proyecto" se vendia en el plan Pro (9,95 EUR/mes)
// y no existia: ProjectChat guardaba los mensajes en useState, no habia tabla,
// y el portal del cliente no tenia chat, asi que no habia nadie al otro lado.
// El boton de resumir era un setTimeout con texto fijo.
//
// Estas comprobaciones leen el codigo y fallan si alguna de esas cuatro cosas
// vuelve. No sustituyen a la prueba de punta a punta contra produccion, pero
// si impiden que el chat vuelva a quedarse en memoria sin que nadie lo note.

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8');

const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('el chat guarda los mensajes de verdad', () => {
  const chat = leer('components/ProjectChat.tsx');
  const hook = leer('hooks/useProjectChat.ts');

  it('ProjectChat ya no guarda los mensajes en estado local', () => {
    expect(sinComentarios(chat)).not.toMatch(/useState<ProjectMessage\[\]>/);
  });

  it('los mensajes salen del enganche con la base de datos', () => {
    expect(chat).toMatch(/useProjectChat\(/);
  });

  it('el enganche lee y escribe en project_messages', () => {
    expect(hook).toMatch(/from\(['"]project_messages['"]\)/);
    expect(hook).toMatch(/\.insert\(/);
    expect(hook).toMatch(/\.select\(/);
  });

  it('escucha en tiempo real para que el otro lado aparezca solo', () => {
    expect(hook).toMatch(/postgres_changes/);
    expect(hook).toMatch(/channel\(/);
  });

  it('se da de baja del canal al desmontar, sin dejar suscripciones sueltas', () => {
    expect(hook).toMatch(/removeChannel/);
  });
});

describe('el autor no viaja desde el navegador', () => {
  const hook = leer('hooks/useProjectChat.ts');

  it('el insert solo manda proyecto y texto', () => {
    // author_name y author_role los sella un trigger en la base de datos. Si
    // viajaran aqui, un cliente del portal podria firmar un mensaje como si
    // fuera el freelancer.
    const inserts = hook.match(/\.insert\(\{[^}]*\}\)/g) ?? [];
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      expect(insert).toMatch(/project_id/);
      expect(insert).toMatch(/body/);
      expect(insert).not.toMatch(/author_name/);
      expect(insert).not.toMatch(/author_role/);
      expect(insert).not.toMatch(/author_id/);
    }
  });
});

describe('el resumen de IA no es de mentira', () => {
  const chat = sinComentarios(leer('components/ProjectChat.tsx'));

  it('no queda ninguna simulacion con setTimeout', () => {
    expect(chat).not.toMatch(/Simulaci/i);
    expect(chat).not.toMatch(/setTimeout/);
  });

  it('llama a la IA de verdad', () => {
    expect(chat).toMatch(/getAIResponse\(/);
  });

  it('no se inventa un texto fijo de resumen', () => {
    expect(chat).not.toMatch(/Resumen de la IA:/);
    expect(chat).not.toMatch(/proxima reunion|próxima reunión/i);
  });
});

describe('el cliente tiene donde leer y responder', () => {
  it('existe la pagina del proyecto en el portal', () => {
    const portal = leer('pages/portal/PortalProjectPage.tsx');
    expect(portal).toMatch(/ProjectChat/);
  });

  it('esta enrutada en App.tsx', () => {
    const app = leer('App.tsx');
    expect(app).toMatch(/projects\/:projectId/);
    expect(app).toMatch(/PortalProjectPage/);
  });

  it('el listado de proyectos del portal enlaza a ella', () => {
    const panel = leer('pages/portal/PortalDashboardPage.tsx');
    expect(panel).toMatch(/\/portal\/projects\//);
  });

  it('el cliente no puede gastar los creditos del freelancer', () => {
    // El boton de resumir va detras de `puedeResumir`, que el portal no pasa.
    const portal = leer('pages/portal/PortalProjectPage.tsx');
    expect(portal).not.toMatch(/puedeResumir/);
    const chat = leer('components/ProjectChat.tsx');
    expect(chat).toMatch(/puedeResumir\s*=\s*false/);
  });
});
