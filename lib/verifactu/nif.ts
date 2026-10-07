// Verifactu, fase 3 (07/10/2026): NIF español con su letra o dígito de control.
// Igual que verifactu_nif_valido() en la base de datos (migración verifactu_fase3):
// si cambia una, cambiar la otra (src/test/verifactu-nif.test.ts).
//
// La AEAT RECHAZA el registro si el NIF del cliente no está en su censo (1239).
// Un NIF mal tecleado casi siempre falla el control: así se ve en el formulario.

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function nifEspanolValido(nif: string | null | undefined): boolean {
  const v = (nif ?? '').toUpperCase();
  const letraDni = (numero: string) => LETRAS_DNI[Number(numero) % 23];

  if (/^[0-9]{8}[A-Z]$/.test(v)) return letraDni(v.slice(0, 8)) === v[8];
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(v)) return letraDni('XYZ'.indexOf(v[0]) + v.slice(1, 8)) === v[8];
  if (/^[KLM][0-9]{7}[A-Z]$/.test(v)) return letraDni(v.slice(1, 8)) === v[8];

  if (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(v)) {
    let suma = 0;
    for (let i = 1; i <= 7; i++) {
      let d = Number(v[i]);
      if (i % 2 === 1) { d *= 2; d = Math.floor(d / 10) + (d % 10); }
      suma += d;
    }
    const control = (10 - (suma % 10)) % 10;
    const letra = 'JABCDEFGHI'[control];
    if ('PQRSWN'.includes(v[0])) return v[8] === letra;
    if ('ABEH'.includes(v[0])) return v[8] === String(control);
    return v[8] === String(control) || v[8] === letra;
  }
  return false;
}
