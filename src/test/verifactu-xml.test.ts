// @vitest-environment node
// Verifactu, fase 1: el XML de los registros cumple los esquemas oficiales de
// la AEAT y la huella se recalcula igual que en la base de datos.
//
// Los registros de ejemplo (fixtures/verifactu-registros.json) los generó la
// propia función de la base de datos (registrar_factura_fiscal) con la prueba
// supabase/pruebas/verifactu-registro.sql: F1 nacional, encadenado, empresa UE,
// particular de fuera de la UE, simplificada, rectificativa y anulación.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  xmlRegistroAlta, xmlRegistroAnulacion, xmlEnvio, huellaDeRegistro, cadenaHuella, escaparXml,
} from '../../supabase/functions/_shared/verifactu-xml';
import registros from './fixtures/verifactu-registros.json';

const raiz = resolve(__dirname, '../..');
const ESQUEMAS = join(raiz, 'docs/verifactu/aeat/esquemas');

const hayXmllint = (() => {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

/** Copia los XSD a una carpeta temporal con un esquema de firma mínimo local (sin red). */
function esquemasSinRed(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verifactu-xsd-'));
  for (const f of readdirSync(ESQUEMAS)) {
    if (!/\.(xsd|wsdl)$/.test(f)) continue;
    const texto = readFileSync(join(ESQUEMAS, f), 'utf8')
      .replace('http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd', 'xmldsig-local.xsd');
    writeFileSync(join(dir, f), texto);
  }
  writeFileSync(join(dir, 'xmldsig-local.xsd'),
    '<schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="http://www.w3.org/2000/09/xmldsig#" elementFormDefault="qualified">'
    + '<element name="Signature"><complexType><sequence><any processContents="skip" minOccurs="0" maxOccurs="unbounded"/></sequence></complexType></element></schema>');
  return dir;
}

function validar(xml: string): string {
  const dir = esquemasSinRed();
  const fichero = join(dir, 'envio.xml');
  writeFileSync(fichero, '<?xml version="1.0" encoding="UTF-8"?>' + xml);
  try {
    execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(dir, 'SuministroLR.xsd'), fichero], { stdio: 'pipe' });
    return 'ok';
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? e);
  }
}

const OBLIGADO = { NombreRazon: 'Estudio de Prueba', NIF: '12345678Z' };
const todos = (registros as { tipo: string; registro: Record<string, unknown>; hash_input: string }[]);

describe('huella', () => {
  it('ejemplo oficial de la AEAT', async () => {
    const registro = {
      IDFactura: { IDEmisorFactura: '89890001K', NumSerieFactura: '12345678/G33', FechaExpedicionFactura: '01-01-2024' },
      TipoFactura: 'F1', CuotaTotal: '12.35', ImporteTotal: '123.45',
      Encadenamiento: { PrimerRegistro: 'S' }, FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    };
    expect(await huellaDeRegistro(registro)).toBe('3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
  });

  it.each(todos.map((r) => [r.tipo, r] as const))('%s: misma cadena y huella que la base de datos', async (_t, r) => {
    expect(cadenaHuella(r.registro)).toBe(r.hash_input);
    expect(await huellaDeRegistro(r.registro)).toBe(r.registro.Huella);
  });

  it('la cadena va encadenada: cada registro apunta a la huella del anterior', () => {
    for (let i = 1; i < todos.length; i++) {
      const enc = todos[i].registro.Encadenamiento as { RegistroAnterior: { Huella: string } };
      expect(enc.RegistroAnterior.Huella).toBe(todos[i - 1].registro.Huella);
    }
    expect((todos[0].registro.Encadenamiento as { PrimerRegistro: string }).PrimerRegistro).toBe('S');
  });
});

describe('XML', () => {
  it('escapa los caracteres especiales', () => {
    expect(escaparXml(`a & b < "c" > 'd'`)).toBe('a &amp; b &lt; &quot;c&quot; &gt; &apos;d&apos;');
  });

  it('pone los campos en el orden del esquema aunque el JSON venga desordenado', () => {
    const alta = todos.find((r) => r.tipo === 'alta:F1')!.registro;
    const xml = xmlRegistroAlta(alta);
    const pos = (e: string) => xml.indexOf(`<sf:${e}>`);
    expect(pos('IDVersion')).toBeLessThan(pos('IDFactura'));
    expect(pos('TipoFactura')).toBeLessThan(pos('DescripcionOperacion'));
    expect(pos('Desglose')).toBeLessThan(pos('CuotaTotal'));
    expect(pos('FechaHoraHusoGenRegistro')).toBeLessThan(pos('Huella'));
  });

  it('rechaza un campo que no existe en el esquema', () => {
    expect(() => xmlRegistroAlta({ IDVersion: '1.0', Inventado: 'x' })).toThrow(/Inventado/);
  });

  it('el registro de anulación usa sus propios campos', () => {
    const anul = todos.find((r) => r.tipo.startsWith('anulacion'))!.registro;
    expect(xmlRegistroAnulacion(anul)).toContain('<sf:NumSerieFacturaAnulada>');
  });

  it.skipIf(!hayXmllint)('el envío con los 7 registros valida contra SuministroLR.xsd oficial', () => {
    const xml = xmlEnvio(OBLIGADO, todos.map((r) => ({
      record_type: r.tipo.startsWith('alta') ? 'alta' : 'anulacion',
      registro: r.registro,
    })));
    expect(validar(xml)).toBe('ok');
  });

  it.skipIf(!hayXmllint)('y la validación detecta un registro roto', () => {
    const roto = { ...todos[0].registro, TipoFactura: 'X9' };
    expect(validar(xmlEnvio(OBLIGADO, [{ record_type: 'alta', registro: roto }]))).not.toBe('ok');
  });
});

