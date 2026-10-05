import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// La integración de Supabase con GitHub despliega las funciones al fusionar en
// main con lo que diga config.toml. Una función sin declarar se desplegaría
// con verify_jwt = true por defecto: para stripe-webhook (Stripe no manda
// sesión) eso rompería los pagos.
const raiz = resolve(__dirname, '../..');
const config = readFileSync(resolve(raiz, 'supabase/config.toml'), 'utf8');
const funciones = readdirSync(resolve(raiz, 'supabase/functions')).filter(
  (d) => !d.startsWith('_') && statSync(resolve(raiz, 'supabase/functions', d)).isDirectory(),
);
const verifyJwt = (f: string) => new RegExp(`\\[functions\\.${f}\\]\\s*\\nverify_jwt = (true|false)`).exec(config)?.[1];

describe('supabase/config.toml', () => {
  it('declara verify_jwt para cada Edge Function', () => {
    for (const f of funciones) expect(verifyJwt(f), f).toMatch(/^(true|false)$/);
  });

  it('las que llaman Stripe o las tareas programadas no exigen sesión', () => {
    for (const f of ['stripe-webhook', 'process-recurring-invoices', 'recordatorios-cobro', 'get-public-invoice']) {
      expect(verifyJwt(f), f).toBe('false');
    }
  });

  it('las que actúan sobre la cuenta del usuario sí la exigen', () => {
    for (const f of ['cancelar-suscripcion', 'eliminar-cuenta', 'checkout-fundadores', 'ai-gemini']) {
      expect(verifyJwt(f), f).toBe('true');
    }
  });
});
