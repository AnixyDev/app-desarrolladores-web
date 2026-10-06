import { describe, it, expect } from 'vitest';
import {
  esClienteExtranjero,
  mencionSinIva,
  normalizarNifIva,
  nifIvaValido,
  MENCIONES_SIN_IVA,
} from '../../lib/ivaClientes';

describe('facturas sin IVA a clientes extranjeros', () => {
  it('solo los clientes de la UE y de fuera son extranjeros', () => {
    expect(esClienteExtranjero('nacional')).toBe(false);
    expect(esClienteExtranjero(undefined)).toBe(false);
    expect(esClienteExtranjero('empresa_ue')).toBe(true);
    expect(esClienteExtranjero('fuera_ue')).toBe(true);
  });

  it('cada motivo tiene su mención y sin motivo no hay mención', () => {
    expect(mencionSinIva('inversion_sujeto_pasivo_ue')).toContain('Inversión del sujeto pasivo');
    expect(mencionSinIva('no_sujeta_fuera_ue')).toContain('no sujeta');
    expect(mencionSinIva(null)).toBeNull();
    expect(Object.keys(MENCIONES_SIN_IVA)).toHaveLength(3);
  });

  it('normaliza el NIF-IVA como lo espera la base de datos', () => {
    expect(normalizarNifIva(' de 123-456.789 ')).toBe('DE123456789');
    expect(normalizarNifIva('')).toBeNull();
    expect(normalizarNifIva(undefined)).toBeNull();
  });

  it('valida el NIF-IVA con el mismo patrón que la restricción SQL', () => {
    expect(nifIvaValido('DE123456789')).toBe(true);
    expect(nifIvaValido('FR12345678901')).toBe(true);
    expect(nifIvaValido('123456789')).toBe(false);
    expect(nifIvaValido('D1')).toBe(false);
  });
});
