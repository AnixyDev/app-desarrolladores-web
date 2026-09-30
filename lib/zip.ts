// ZIP sin compresión (30/09/2026). Suficiente para empaquetar PDFs, que ya
// van comprimidos por dentro, sin añadir una dependencia nueva. Formato
// PKZIP «stored» (método 0), con CRC-32 y nombres en UTF-8.

export interface ArchivoZip { nombre: string; datos: Uint8Array }

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function crearZip(archivos: ArchivoZip[]): Uint8Array {
  const enc = new TextEncoder();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const tam = a.datos.length;

    const local = new Uint8Array(30 + nombre.length);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true);
    vl.setUint16(4, 20, true);         // versión necesaria
    vl.setUint16(6, 0x0800, true);     // nombres en UTF-8
    vl.setUint16(8, 0, true);          // sin compresión
    vl.setUint32(14, crc, true);
    vl.setUint32(18, tam, true);
    vl.setUint32(22, tam, true);
    vl.setUint16(26, nombre.length, true);
    local.set(nombre, 30);
    locales.push(local, a.datos);

    const central = new Uint8Array(46 + nombre.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, 20, true);
    vc.setUint16(6, 20, true);
    vc.setUint16(8, 0x0800, true);
    vc.setUint16(10, 0, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, tam, true);
    vc.setUint32(24, tam, true);
    vc.setUint16(28, nombre.length, true);
    vc.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);
    centrales.push(central);

    desplazamiento += local.length + tam;
  }

  const tamCentral = centrales.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, archivos.length, true);
  vf.setUint16(10, archivos.length, true);
  vf.setUint32(12, tamCentral, true);
  vf.setUint32(16, desplazamiento, true);

  const partes = [...locales, ...centrales, fin];
  const total = partes.reduce((s, p) => s + p.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { salida.set(p, pos); pos += p.length; }
  return salida;
}
