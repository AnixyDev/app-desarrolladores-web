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
    esbuild: {
      // Elimina console.log/warn/info/debug/error y debugger SOLO en build de producción.
      // En "npm run dev" / "pnpm dev" se mantienen intactos para depurar normalmente.
      drop: isProd ? ['console', 'debugger'] : [],
    },
    build: {
      sourcemap: false, // antes: true — exponía el código fuente completo en F12 > Sources
      chunkSizeWarningLimit: 600,
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
