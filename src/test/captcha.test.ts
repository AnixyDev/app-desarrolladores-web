import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * El CAPTCHA solo protege si TODAS las puertas lo piden. Cuando se active en
 * Supabase, cualquier llamada de acceso que salga sin token se rompe para el
 * usuario; y cualquier llamada nueva que se añada sin él será, además, la
 * puerta por la que volver a crear cuentas y mandar correos a granel.
 */

const RAIZ = path.resolve(__dirname, '../..');

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

const cargarCaptcha = async (clave: string) => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', clave);
    vi.resetModules();
    return import('../../lib/captcha');
};

describe('sin clave configurada (local, CI)', () => {
    it('el CAPTCHA está apagado y el formulario se puede enviar sin token', async () => {
        const c = await cargarCaptcha('');
        expect(c.captchaActivo()).toBe(false);
        expect(c.puedeEnviarConCaptcha(null)).toBe(true);
    });

    it('una clave de solo espacios cuenta como ninguna', async () => {
        const c = await cargarCaptcha('   ');
        expect(c.captchaActivo()).toBe(false);
    });
});

describe('con clave configurada (producción)', () => {
    it('no deja enviar sin token', async () => {
        const c = await cargarCaptcha('0x4AAAAAAAclave');
        expect(c.captchaActivo()).toBe(true);
        expect(c.puedeEnviarConCaptcha(null)).toBe(false);
        expect(c.puedeEnviarConCaptcha('')).toBe(false);
    });

    it('con token, sí', async () => {
        const c = await cargarCaptcha('0x4AAAAAAAclave');
        expect(c.puedeEnviarConCaptcha('token-de-turnstile')).toBe(true);
    });
});

describe('opcionesCaptcha', () => {
    it('con token lo añade', async () => {
        const c = await cargarCaptcha('');
        expect(c.opcionesCaptcha('abc')).toEqual({ captchaToken: 'abc' });
    });

    it('sin token no añade nada, ni siquiera la clave vacía', async () => {
        const c = await cargarCaptcha('');
        expect(c.opcionesCaptcha(null)).toEqual({});
        expect(c.opcionesCaptcha(undefined)).toEqual({});
        expect(c.opcionesCaptcha('')).toEqual({});
    });
});

describe('esErrorDeCaptcha', () => {
    it('reconoce el código de Supabase', async () => {
        const c = await cargarCaptcha('');
        expect(c.esErrorDeCaptcha({ code: 'captcha_failed' })).toBe(true);
    });

    it('reconoce el mensaje aunque no venga código', async () => {
        const c = await cargarCaptcha('');
        expect(c.esErrorDeCaptcha({ message: 'captcha verification process failed' })).toBe(true);
    });

    it('no confunde otros errores', async () => {
        const c = await cargarCaptcha('');
        expect(c.esErrorDeCaptcha({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false);
        expect(c.esErrorDeCaptcha(null)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Lectura del código fuente: toda llamada de acceso lleva el token.
// ---------------------------------------------------------------------------

const LLAMADAS_PROTEGIDAS = ['signInWithPassword', 'signUp', 'signInWithOtp', 'resetPasswordForEmail'];

const ficherosDelFrontend = (dir: string): string[] => {
    const fuera = new Set(['node_modules', '.git', 'dist', 'supabase', 'test', 'scripts', 'public']);
    const salida: string[] = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        if (fuera.has(entrada.name)) continue;
        const ruta = path.join(dir, entrada.name);
        if (entrada.isDirectory()) salida.push(...ficherosDelFrontend(ruta));
        else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.endsWith('.d.ts')) salida.push(ruta);
    }
    return salida;
};

/** Texto de la llamada: desde `supabase.auth.X(` hasta su paréntesis de cierre. */
const cuerpoDeLaLlamada = (codigo: string, inicio: number): string => {
    let profundidad = 0;
    for (let i = codigo.indexOf('(', inicio); i < codigo.length; i++) {
        if (codigo[i] === '(') profundidad++;
        else if (codigo[i] === ')' && --profundidad === 0) return codigo.slice(inicio, i + 1);
    }
    return codigo.slice(inicio);
};

const llamadasEncontradas = () => {
    const resultado: { fichero: string; metodo: string; cuerpo: string }[] = [];
    for (const fichero of ficherosDelFrontend(RAIZ)) {
        const codigo = fs.readFileSync(fichero, 'utf8');
        for (const metodo of LLAMADAS_PROTEGIDAS) {
            const patron = new RegExp(`supabase\\.auth\\.${metodo}\\(`, 'g');
            let m: RegExpExecArray | null;
            while ((m = patron.exec(codigo))) {
                resultado.push({
                    fichero: path.relative(RAIZ, fichero),
                    metodo,
                    cuerpo: cuerpoDeLaLlamada(codigo, m.index),
                });
            }
        }
    }
    return resultado;
};

describe('toda llamada de acceso manda el token', () => {
    const llamadas = llamadasEncontradas();

    it('encuentra las cuatro llamadas conocidas (si baja, el test está mirando mal)', () => {
        const metodos = new Set(llamadas.map((l) => l.metodo));
        for (const m of LLAMADAS_PROTEGIDAS) expect(metodos, `falta ${m}`).toContain(m);
    });

    it.each(llamadasEncontradas().map((l) => [`${l.fichero} → ${l.metodo}`, l.cuerpo]))(
        '%s incluye opcionesCaptcha',
        (_nombre, cuerpo) => {
            expect(cuerpo).toContain('opcionesCaptcha(');
        }
    );
});

describe('los cuatro formularios pintan el widget y lo reinician', () => {
    const FORMULARIOS = [
        'pages/LoginPage.tsx',
        'pages/auth/RegisterPage.tsx',
        'pages/auth/ForgotPasswordPage.tsx',
        'pages/portal/PortalLoginPage.tsx',
    ];

    it.each(FORMULARIOS)('%s', (fichero) => {
        const codigo = fs.readFileSync(path.join(RAIZ, fichero), 'utf8');
        expect(codigo).toContain('<CaptchaTurnstile');
        // Un token vale una sola vez: sin reiniciar, el segundo intento falla.
        expect(codigo).toContain('reiniciar()');
        // El botón no se habilita sin token cuando el CAPTCHA está activo.
        expect(codigo).toContain('puedeEnviarConCaptcha(captchaToken)');
    });
});
