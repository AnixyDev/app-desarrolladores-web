import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// import { visualizer } from 'rollup-plugin-visualizer'; // reactivar para re-analizar el bundle

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname),
      },
    },
    // CAMBIO: se elimina el bloque esbuild.drop.
    //
    // Vite 8 transforma y minifica con oxc, no con esbuild, e ignoraba esa
    // opción por completo. Lo avisaba en cada build:
    //   "Both esbuild and oxc options were set. oxc options will be used and
    //    esbuild options will be ignored. The following esbuild options were
    //    set: { drop: [ 'console', 'debugger' ] }"
    // Resultado: desde la subida a Vite 8 los console.log seguían saliendo en
    // producción — 26 console.log, 68 console.error y 24 console.warn en el
    // chunk de entrada, con correos de usuario y trazas de autenticación a la
    // vista de cualquiera que abriese F12. El equivalente en oxc está en las
    // opciones de minificado (output.minify), más abajo.
    build: {
      sourcemap: false, // antes: true — exponía el código fuente completo en F12 > Sources
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // CAMBIO: sustituto real de esbuild.drop en Vite 8 / Rolldown.
          // compress.dropConsole elimina las llamadas a console.* y
          // dropDebugger las sentencias debugger. Solo afecta al build de
          // producción: en "pnpm dev" no se minifica, así que los logs siguen
          // intactos para depurar.
          minify: isProd
            ? { compress: { dropConsole: true, dropDebugger: true } }
            : false,
        },
      },
      // CAMBIO (rendimiento): se elimina manualChunks por completo.
      //
      // Por qué: al forzar a mano los grupos de vendors se creaban
      // dependencias cruzadas entre chunks. El resultado era que el chunk de
      // entrada importaba de forma ESTÁTICA vendor-pdf (jsPDF, 488 kB),
      // vendor-dnd, vendor-supabase, vendor-corejs y el cajón 'vendor' — y
      // Vite generaba un <link rel="modulepreload"> para cada uno en el HTML.
      // Es decir: la landing pública descargaba ~1,2 MB de JavaScript que solo
      // hacen falta dentro de la app (generar PDFs, Kanban, gráficas).
      //
      // Sin manualChunks, Rolldown reparte los chunks siguiendo los
      // import() dinámicos reales: jsPDF, recharts y html2canvas quedan en
      // chunks aparte que solo se descargan al entrar en las páginas que los
      // usan. El HTML pasa de 9 modulepreload a ninguno.
      //
      // NO volver a añadir manualChunks sin comprobar después, en dist/index.html,
      // cuántos <link rel="modulepreload"> se generan.
    },
  };
});
