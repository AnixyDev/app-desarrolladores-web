import { describe, it, expect } from 'vitest';
import {
  CIERRE_FUNDADORES,
  ITEM_KEY_FUNDADORES,
  LOOKUP_KEY_FUNDADORES,
  PLAZAS_TOTALES,
  calcularPlazas,
  esReservaVigente,
  estadoFundadores,
  ofertaAbierta,
} from '../../supabase/functions/_shared/fundadores';
import { esComprablePorCheckout, precioDe } from '../../supabase/functions/_shared/catalogo-stripe';

const OCT = new Date('2026-10-03T12:00:00Z');
const seg = (d: Date) => Math.floor(d.getTime() / 1000);

describe('fecha límite', () => {
  it('abierta el 31/12/2026 a las 23:59:59 en Madrid', () => {
    expect(ofertaAbierta(new Date('2026-12-31T23:59:59+01:00'))).toBe(true);
  });
  it('cerrada a las 00:00 del 1/1/2027 en Madrid', () => {
    expect(ofertaAbierta(new Date('2027-01-01T00:00:00+01:00'))).toBe(false);
    expect(CIERRE_FUNDADORES.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });
});

describe('calcularPlazas', () => {
  it('50 menos suscripciones menos reservas', () => {
    expect(calcularPlazas({ suscripciones: 10, reservas: 2, ahora: OCT })).toMatchObject({ total: 50, restantes: 38, disponible: true });
  });
  it('nunca negativo y sin plazas no está disponible', () => {
    expect(calcularPlazas({ suscripciones: 50, reservas: 3, ahora: OCT })).toMatchObject({ restantes: 0, disponible: false });
  });
  it('después del cierre no está disponible aunque queden plazas', () => {
    expect(calcularPlazas({ suscripciones: 0, reservas: 0, ahora: new Date('2027-01-02T00:00:00Z') }).disponible).toBe(false);
  });
});

describe('reservas', () => {
  const base = { id: 'cs_1', status: 'open', expires_at: seg(OCT) + 600, metadata: { itemKey: ITEM_KEY_FUNDADORES } };
  it('un pago de fundadores abierto reserva plaza', () => {
    expect(esReservaVigente(base, seg(OCT))).toBe(true);
  });
  it('no reservan: completados, caducados ni pagos de otros planes', () => {
    expect(esReservaVigente({ ...base, status: 'complete' }, seg(OCT))).toBe(false);
    expect(esReservaVigente({ ...base, expires_at: seg(OCT) - 1 }, seg(OCT))).toBe(false);
    expect(esReservaVigente({ ...base, metadata: { itemKey: 'proPlanYearly' } }, seg(OCT))).toBe(false);
  });
});

// Stripe simulado: paginación incluida, para comprobar que se cuenta todo.
function stripeFalso(p: { precio?: string | null; subs: { status: string }[]; sesiones: any[] }) {
  const paginar = <T extends { id: string }>(items: T[], desde?: string, tam = 2) => {
    const i = desde ? items.findIndex((x) => x.id === desde) + 1 : 0;
    const data = items.slice(i, i + tam);
    return { data, has_more: i + tam < items.length };
  };
  const subs = p.subs.map((s, i) => ({ id: `sub_${i}`, ...s }));
  return {
    llamadas: [] as any[],
    prices: {
      list: async (q: any) => {
        expect(q.lookup_keys).toEqual([LOOKUP_KEY_FUNDADORES]);
        return { data: p.precio ? [{ id: p.precio }] : [] };
      },
    },
    subscriptions: {
      list: async (q: any) => {
        expect(q.price).toBe(p.precio);
        expect(q.status).toBe('all');
        return paginar(subs, q.starting_after);
      },
    },
    checkout: { sessions: { list: async (q: any) => paginar(p.sesiones, q.starting_after) } },
  };
}

describe('estadoFundadores (con Stripe simulado)', () => {
  it('cuenta solo active, trialing y past_due, en todas las páginas, y resta las reservas', async () => {
    const stripe = stripeFalso({
      precio: 'price_fund',
      subs: [
        { status: 'active' }, { status: 'active' }, { status: 'trialing' },
        { status: 'past_due' }, { status: 'canceled' }, { status: 'incomplete_expired' }, { status: 'unpaid' },
      ],
      sesiones: [
        { id: 'cs_a', status: 'open', expires_at: seg(OCT) + 900, metadata: { itemKey: ITEM_KEY_FUNDADORES, supabase_user_id: 'u1' } },
        { id: 'cs_b', status: 'open', expires_at: seg(OCT) + 900, metadata: { itemKey: 'proPlan' } },
        { id: 'cs_c', status: 'expired', expires_at: seg(OCT) - 10, metadata: { itemKey: ITEM_KEY_FUNDADORES } },
      ],
    });
    const e = await estadoFundadores(stripe, OCT);
    expect(e.restantes).toBe(PLAZAS_TOTALES - 4 - 1);
    expect(e.disponible).toBe(true);
    expect(e.reservas.map((r) => r.id)).toEqual(['cs_a']);
  });

  it('con la última plaza reservada por otro, no quedan plazas', async () => {
    const stripe = stripeFalso({
      precio: 'price_fund',
      subs: Array.from({ length: 49 }, () => ({ status: 'active' })),
      sesiones: [{ id: 'cs_x', status: 'open', expires_at: seg(OCT) + 900, metadata: { itemKey: ITEM_KEY_FUNDADORES, supabase_user_id: 'otro' } }],
    });
    const e = await estadoFundadores(stripe, OCT);
    expect(e.restantes).toBe(0);
    expect(e.disponible).toBe(false);
  });

  it('si Stripe no termina de paginar, falla en vez de contar de menos', async () => {
    const stripe = stripeFalso({ precio: 'price_fund', subs: [], sesiones: [] });
    let n = 0;
    stripe.subscriptions.list = async () => ({ data: [{ id: `sub_${n++}`, status: 'active' }], has_more: true });
    await expect(estadoFundadores(stripe, OCT)).rejects.toThrow(/recuento abortado/);
  });

  it('sin precio con la lookup key, la oferta no está disponible', async () => {
    const e = await estadoFundadores(stripeFalso({ precio: null, subs: [], sesiones: [] }), OCT);
    expect(e.disponible).toBe(false);
    expect(e.precioId).toBeNull();
  });
});

describe('catálogo', () => {
  it('el plan de fundadores no se puede comprar por create-checkout-session', () => {
    expect(esComprablePorCheckout('proPlanFundadores')).toBe(false);
  });
  it('se muestra como 59 €/año', () => {
    expect(precioDe('proPlanFundadores')).toEqual({ precio: '59€', periodo: 'año' });
  });
});
