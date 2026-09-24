import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STRIPE_ITEMS, precioDe, esComprablePorCheckout } from '../../supabase/functions/_shared/catalogo-stripe';

// El modal de conversion a Teams —el que abren OCHO paginas cuando un usuario
// Free topa con un limite— anunciaba 35,95 euros por un plan que cobra 45,95.
// La subida de agosto se aplico en PricingPage y en BillingPage y ese modal se
// quedo atras, porque cada pantalla tenia su propia copia del precio escrita a
// mano. Y su boton de pagar hacia `alert("(Simulación)")`.
//
// Estos casos impiden las dos cosas: que un precio se escriba suelto en una
// pantalla, y que el boton de pagar no pague.

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8');

const PANTALLAS_CON_PRECIO = [
  'pages/PricingPage.tsx',
  'pages/BillingPage.tsx',
  'components/modals/UpgradeModal.tsx',
  'components/modals/BuyCreditsModal.tsx',
];

describe('el catalogo tiene el precio de todo lo que se vende', () => {
  it('los cuatro planes de suscripcion tienen precio y periodo', () => {
    for (const clave of ['proPlan', 'proPlanYearly', 'teamsPlan', 'teamsPlanYearly']) {
      const tarifa = precioDe(clave);
      expect(tarifa, `falta el precio de ${clave}`).not.toBeNull();
      expect(tarifa!.precio).toMatch(/\d/);
      expect(['mes', 'año']).toContain(tarifa!.periodo);
    }
  });

  it('los tres paquetes de creditos de IA tienen precio', () => {
    for (const clave of ['aiCredits100', 'aiCredits500', 'aiCredits1000']) {
      expect(precioDe(clave), `falta el precio de ${clave}`).not.toBeNull();
    }
  });

  it('Teams cuesta 45,95 al mes, no 35,95', () => {
    // El valor concreto que estaba mal. Si alguien vuelve a tocarlo, que sea a
    // conciencia y en un solo sitio.
    expect(precioDe('teamsPlan')!.precio).toBe('45,95€');
  });

  it('el anual sale mas barato que doce mensualidades', () => {
    const aNumero = (s: string) => parseFloat(s.replace('€', '').replace('.', '').replace(',', '.'));
    for (const [mensual, anual] of [['proPlan', 'proPlanYearly'], ['teamsPlan', 'teamsPlanYearly']]) {
      const porAno = aNumero(precioDe(mensual)!.precio) * 12;
      expect(aNumero(precioDe(anual)!.precio)).toBeLessThan(porAno);
    }
  });

  it('precioDe no se inventa un precio', () => {
    expect(precioDe('invoicePayment')).toBeNull();   // lo calcula la factura
    expect(precioDe('featuredJobPost')).toBeNull();  // sin precio declarado
    expect(precioDe('noExiste')).toBeNull();
    expect(precioDe('constructor')).toBeNull();
  });

  it('todo lo que tiene precio se puede comprar de verdad', () => {
    for (const clave of Object.keys(STRIPE_ITEMS)) {
      if (precioDe(clave) !== null) {
        expect(esComprablePorCheckout(clave), `${clave} tiene precio pero no priceId`).toBe(true);
      }
    }
  });
});

describe('ninguna pantalla escribe un precio a mano', () => {
  for (const ruta of PANTALLAS_CON_PRECIO) {
    it(`${ruta} lee el precio del catalogo`, () => {
      const fuente = leer(ruta);
      expect(fuente).toMatch(/precioDe\(/);
    });

    it(`${ruta} no lleva importes en euros sueltos`, () => {
      const fuente = leer(ruta);
      // Se ignoran los comentarios: ahi si se documenta la subida de precios.
      const sinComentarios = fuente
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const sueltos = sinComentarios.match(/["'`]\s*\d+[.,]\d{2}\s*€/g) ?? [];
      expect(sueltos, `precios escritos a mano: ${sueltos.join(', ')}`).toEqual([]);
    });
  }
});

describe('el modal de conversion cobra de verdad', () => {
  const fuente = leer('components/modals/UpgradeModal.tsx');

  it('no queda ningun alert() de simulacion', () => {
    const sinComentarios = fuente
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(sinComentarios).not.toMatch(/alert\(/);
    expect(sinComentarios).not.toMatch(/Simulaci/i);
  });

  it('llama al checkout de Stripe con el plan de equipos', () => {
    expect(fuente).toMatch(/redirectToCheckout\(\s*['"]teamsPlan['"]\s*\)/);
  });

  it('avisa al usuario si el pago no se puede abrir', () => {
    expect(fuente).toMatch(/addToast/);
  });
});
