import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Lo que la página de precios promete tiene que existir.
 *
 * El 26/09 se revisaron las doce promesas de /pricing y /billing contra el
 * código y la base de datos: seis eran falsas y dos, a medias (hitos
 * inexistentes, créditos "mensuales" que se daban una vez, roles que no
 * limitaban nada, webhooks que nadie enviaba…). Se construyeron o se
 * corrigieron. Esta lista es el registro de cada una y de qué la respalda.
 *
 * Si añades una promesa nueva, este test falla hasta que la añadas aquí
 * junto con la prueba de que existe. Es a propósito.
 */
const PROMESAS_VERIFICADAS: Record<string, string> = {
    // Free
    '1 cliente': 'ClientsPage.tsx: plan Free con 1 cliente abre el aviso de mejora',
    'Facturación básica': 'InvoicesPage / CreateInvoicePage',
    '10 créditos IA': 'profiles.ai_credits default 10 (+ disparador de columnas de pago: una alta desde el navegador nace con 10)',
    // Pro
    'Proyectos e Hitos ilimitados': 'project_milestones + supabase/pruebas/hitos-de-proyecto.sql',
    'Facturación AEAT (Veri*Factu) · TicketBAI próximamente': 'Veri*Factu: fiscal_records y /fiscal. TicketBAI marcado como próximamente (decisión de Ana, 26/09)',
    'Canal de chat privado por proyecto': 'project_messages + ProjectChat (auditoría 24/09)',
    '50 Créditos IA mensuales': 'recargar_creditos_mensuales() + supabase/pruebas/recarga-mensual-de-creditos.sql',
    // Teams
    'Hasta 5 miembros de equipo': '_shared/limites-equipo.ts (auditoría 24/09)',
    'Roles y permisos avanzados': 'rol_en_equipo() + supabase/pruebas/roles-del-equipo.sql + lib/permisosEquipo.ts',
    'Integraciones con Slack y Webhooks': 'enviar_webhooks() + supabase/pruebas/webhooks-de-integraciones.sql (probado contra httpbin.org)',
    '200 Créditos IA mensuales compartidos': 'recarga mensual + saldo_creditos_ia() + supabase/pruebas/creditos-compartidos-del-equipo.sql',
};

const RAIZ = path.resolve(__dirname, '../..');

const promesasDe = (fichero: string): string[] => {
    const codigo = fs.readFileSync(path.join(RAIZ, fichero), 'utf8');
    const listas = [...codigo.matchAll(/features=\{\[([^\]]*)\]\}/g)].map(m => m[1]);
    return listas.flatMap(l => [...l.matchAll(/"([^"]+)"/g)].map(m => m[1]));
};

describe.each(['pages/PricingPage.tsx', 'pages/BillingPage.tsx'])('%s', (fichero) => {
    const promesas = promesasDe(fichero);

    it('tiene promesas que leer (si esto falla, el test está mirando mal)', () => {
        expect(promesas.length).toBeGreaterThanOrEqual(8);
    });

    it.each(promesas)('«%s» está verificada', (promesa) => {
        expect(PROMESAS_VERIFICADAS, `Promesa sin verificar: «${promesa}». Compruébala y añádela a PROMESAS_VERIFICADAS.`)
            .toHaveProperty([promesa]);
    });
});

it('"TicketBAI ready" no vuelve a aparecer como si existiera', () => {
    for (const f of ['pages/PricingPage.tsx', 'pages/BillingPage.tsx']) {
        expect(fs.readFileSync(path.join(RAIZ, f), 'utf8')).not.toMatch(/TicketBAI ready/);
    }
});
