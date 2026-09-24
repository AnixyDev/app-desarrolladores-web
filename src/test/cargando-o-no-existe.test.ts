import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// "Proyecto o cliente no encontrado."
//
// Eso es lo que salia al abrir la pagina de un proyecto que SI existia. El
// store arranca con las listas vacias y las rellena en segundo plano, asi que
// mientras llegaban los datos `getProjectById` devolvia undefined y la pagina
// concluia que el proyecto no existia. Al refrescar, lo primero que veia el
// usuario era un error rojo diciendole que su proyecto no estaba.
//
// Peor: los fetch se tragaban los errores (`if (!error && data) set(...)`), asi
// que si la carga fallaba, ese "no encontrado" se quedaba para siempre.
//
// El arreglo es un indicador en el store, `datosDeTrabajoCargados`, que separa
// "todavia no han llegado" de "no existe". Estas comprobaciones impiden que
// alguna de las cuatro paginas de detalle vuelva a olvidarlo.

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8');

const PAGINAS_DE_DETALLE = [
  'pages/ProjectDetailPage.tsx',
  'pages/ClientDetailPage.tsx',
  'pages/JobDetailPage.tsx',
  'pages/JobApplicantsPage.tsx',
];

describe('el store distingue cargando de no existe', () => {
  const auth = leer('hooks/store/authSlice.ts');

  it('expone el indicador', () => {
    expect(auth).toMatch(/datosDeTrabajoCargados: boolean/);
    expect(auth).toMatch(/datosDeTrabajoCargados: false/);
  });

  it('lo levanta cuando terminan las cargas, aunque alguna falle', () => {
    // Con `.finally` en vez de `.then`: si una carga falla, es mejor decir "no
    // encontrado" que dejar un giro infinito.
    expect(auth).toMatch(/\.finally\(\(\)\s*=>\s*\{[\s\S]*?datosDeTrabajoCargados:\s*true/);
  });

  it('espera a clientes, proyectos y ofertas, que es de lo que viven esas paginas', () => {
    const lote = auth.match(/Promise\.all\(\[([\s\S]*?)\]\)/);
    expect(lote, 'no encuentro el lote de cargas').not.toBeNull();
    expect(lote![1]).toMatch(/fetchClients/);
    expect(lote![1]).toMatch(/fetchProjects/);
    expect(lote![1]).toMatch(/fetchJobs/);
  });

  it('vuelve a cero al cerrar sesion', () => {
    expect(auth).toMatch(/isAuthenticated: false[\s\S]{0,160}datosDeTrabajoCargados: false/);
  });
});

describe('ninguna pagina de detalle dice "no existe" mientras carga', () => {
  for (const ruta of PAGINAS_DE_DETALLE) {
    it(`${ruta} espera a que lleguen los datos`, () => {
      const fuente = leer(ruta);
      expect(fuente).toMatch(/datosDeTrabajoCargados/);
    });

    it(`${ruta} comprueba el indicador ANTES de decir que no existe`, () => {
      // Se quitan los comentarios: los que explican este mismo arreglo
      // contienen la frase "no encontrado" y saldrian antes que el mensaje
      // de verdad.
      const fuente = leer(ruta)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const posicionIndicador = fuente.indexOf('if (!datosDeTrabajoCargados)');
      const posicionNoExiste = fuente.search(/no encontrad[ao]/);
      expect(posicionIndicador, 'falta la guarda de carga').toBeGreaterThan(-1);
      expect(posicionNoExiste, 'falta el mensaje de no encontrado').toBeGreaterThan(-1);
      expect(posicionIndicador).toBeLessThan(posicionNoExiste);
    });
  }
});
