// @vitest-environment node
// Verifactu, fase 2: sobre SOAP y lectura de las respuestas de la AEAT.
// La respuesta de ejemplo se valida antes contra RespuestaSuministro.xsd
// oficial, para no probar el lector con una respuesta inventada mal formada.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sobreSoap, leerRespuesta, lineaDe, ESTADO_GUARDADO } from '../../supabase/functions/_shared/verifactu-soap';

const NS_R = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd';
const NS_I = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

const linea = (num: string, op: string, estado: string, error?: [string, string]) =>
  `<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>74870299D</tik:IDEmisorFactura><tik:NumSerieFactura>${num}</tik:NumSerieFactura><tik:FechaExpedicionFactura>07-10-2026</tik:FechaExpedicionFactura></tikR:IDFactura>`
  + `<tikR:Operacion><tik:TipoOperacion>${op}</tik:TipoOperacion></tikR:Operacion><tikR:EstadoRegistro>${estado}</tikR:EstadoRegistro>`
  + (error ? `<tikR:CodigoErrorRegistro>${error[0]}</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>${error[1]}</tikR:DescripcionErrorRegistro>` : '')
  + '</tikR:RespuestaLinea>';

const RESPUESTA = `<tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="${NS_R}" xmlns:tik="${NS_I}">`
  + '<tikR:CSV>A-ABCDEF123456</tikR:CSV>'
  + '<tikR:Cabecera><tik:ObligadoEmision><tik:NombreRazon>ANA</tik:NombreRazon><tik:NIF>74870299D</tik:NIF></tik:ObligadoEmision></tikR:Cabecera>'
  + '<tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio><tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>'
  + linea('F-1', 'Alta', 'Correcto')
  + linea('F-2', 'Alta', 'AceptadoConErrores', ['1104', 'El NIF del destinatario no está identificado &amp; revisado'])
  + linea('F-3', 'Alta', 'Incorrecto', ['1100', 'Valor o tipo incorrecto'])
  + linea('F-2', 'Anulacion', 'Correcto')
  + '</tikR:RespuestaRegFactuSistemaFacturacion>';

const hayXmllint = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('respuesta de la AEAT', () => {
  it.skipIf(!hayXmllint)('la respuesta de ejemplo cumple RespuestaSuministro.xsd oficial', () => {
    const origen = resolve(__dirname, '../../docs/verifactu/aeat/esquemas');
    const dir = mkdtempSync(join(tmpdir(), 'verifactu-r-'));
    for (const f of readdirSync(origen)) {
      if (/\.xsd$/.test(f)) writeFileSync(join(dir, f), readFileSync(join(origen, f), 'utf8').replace('http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd', 'xmldsig-local.xsd'));
    }
    writeFileSync(join(dir, 'xmldsig-local.xsd'), '<schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="http://www.w3.org/2000/09/xmldsig#"><element name="Signature"/></schema>');
    writeFileSync(join(dir, 'r.xml'), RESPUESTA);
    expect(() => execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(dir, 'RespuestaSuministro.xsd'), join(dir, 'r.xml')], { stdio: 'pipe' })).not.toThrow();
  });

  it('lee estado, CSV, espera y cada línea dentro de un sobre SOAP', () => {
    const r = leerRespuesta(`<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>${RESPUESTA}</env:Body></env:Envelope>`);
    expect(r.tipo).toBe('respuesta');
    if (r.tipo !== 'respuesta') return;
    expect(r.csv).toBe('A-ABCDEF123456');
    expect(r.estadoEnvio).toBe('ParcialmenteCorrecto');
    expect(r.esperaSegundos).toBe(60);
    expect(r.lineas).toHaveLength(4);
    expect(r.lineas[1]).toMatchObject({ numSerie: 'F-2', estado: 'AceptadoConErrores', codigoError: '1104' });
    expect(r.lineas[1].descripcionError).toContain('& revisado');
  });

  it('distingue el alta y la anulación de la misma factura', () => {
    const r = leerRespuesta(RESPUESTA);
    if (r.tipo !== 'respuesta') throw new Error('debería ser respuesta');
    expect(lineaDe(r.lineas, { record_type: 'anulacion', numero_factura: 'F-2' })?.estado).toBe('Correcto');
    expect(lineaDe(r.lineas, { record_type: 'alta', numero_factura: 'F-2' })?.estado).toBe('AceptadoConErrores');
    expect(ESTADO_GUARDADO.Incorrecto).toBe('rechazado');
  });

  it('un SoapFault rechaza el envío entero y se lee su código', () => {
    const r = leerRespuesta('<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4118].Error técnico: la dirección no se corresponde con el fichero de entrada.</faultstring></env:Fault></env:Body></env:Envelope>');
    expect(r).toEqual({ tipo: 'fallo', codigo: '4118', mensaje: expect.stringContaining('4118') });
  });

  it('una página HTML (403, 401…) no se toma por respuesta', () => {
    expect(leerRespuesta('<!DOCTYPE html><html><title>Agencia Tributaria: 403</title></html>').tipo).toBe('fallo');
  });

  it('el sobre envuelve el mensaje en Body', () => {
    expect(sobreSoap('<x/>')).toMatch(/<soapenv:Body><x\/><\/soapenv:Body>/);
  });
});
