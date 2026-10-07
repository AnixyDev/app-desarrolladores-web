import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DECLARACION_RESPONSABLE as DR, PENDIENTE_ANTES_DE_FIRMAR, textoCumplimiento } from '@/lib/verifactu/declaracionResponsable';

// La declaración tiene que decir lo mismo que el bloque SistemaInformatico que
// la base de datos mete en cada registro (verifactu_sistema_informatico, en la
// migración más reciente que la define).
const definicionSistema = (() => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const conDefinicion = readdirSync(dir).sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .filter((sql) => /create or replace function public\.verifactu_sistema_informatico/.test(sql));
  return conDefinicion[conDefinicion.length - 1] ?? '';
})();
const campo = (nombre: string) => new RegExp(`'${nombre}',\\s*'([^']*)'`).exec(definicionSistema)?.[1];

describe('Declaración responsable', () => {
  it('coincide con el SistemaInformatico de los registros', () => {
    expect(definicionSistema).not.toBe('');
    expect(DR.nombreSistema).toBe(campo('NombreSistemaInformatico'));
    expect(DR.codigoSistema).toBe(campo('IdSistemaInformatico'));
    expect(DR.version).toBe(campo('Version'));
    expect(DR.nifProductor).toBe(campo('NIF'));
    expect(DR.productor).toBe(campo('NombreRazon'));
    expect(DR.soloVerifactu).toBe(campo('TipoUsoPosibleSoloVerifactu') === 'S');
    expect(DR.multiplesObligados).toBe(campo('TipoUsoPosibleMultiOT') === 'S');
  });

  it('lleva la declaración de cumplimiento del art. 15.1.k)', () => {
    const t = textoCumplimiento();
    for (const norma of ['artículo 29.2.j)', 'Ley 58/2003', 'Real Decreto 1007/2023', 'Orden HAC/1177/2024']) {
      expect(t).toContain(norma);
    }
  });

  it('no se marca como firmada con cosas pendientes ni sin fecha', () => {
    if (DR.firmada) {
      expect(PENDIENTE_ANTES_DE_FIRMAR).toHaveLength(0);
      expect(DR.fechaFirma).toBeTruthy();
    } else {
      expect(DR.fechaFirma).toBeNull();
    }
  });
});
