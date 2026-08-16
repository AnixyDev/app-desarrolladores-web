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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('react-router-dom') || id.includes('/react-dom/') || id.includes('/react/')) {
              return 'vendor-react';
            }
            if (id.includes('recharts')) return 'vendor-recharts';
            // CAMBIO: qrcode/canvg/dompurify son dependencias reales de jsPDF
            // (dompurify salió en el audit de seguridad como '.>jspdf>dompurify'),
            // usadas solo para el QR tributario de las facturas.
            if (id.includes('jspdf') || id.includes('qrcode') || id.includes('canvg') || id.includes('dompurify')) {
              return 'vendor-pdf';
            }
            if (id.includes('@stripe/stripe-js') || id.includes('@stripe/react-stripe-js')) return 'vendor-stripe';
            if (id.includes('@google/generative-ai')) return 'vendor-ai';
            if (id.includes('marked')) return 'vendor-markdown';
            if (id.includes('@dnd-kit')) return 'vendor-dnd';
            // CAMBIO: antes solo '@supabase/supabase-js' exacto — el cliente
            // de auth interno vive en '@supabase/auth-js' (módulo "GoTrue"),
            // que no coincidía y caía en el cajón genérico. Ampliado a @supabase/*.
            if (id.includes('@supabase/')) return 'vendor-supabase';
            if (id.includes('@react-oauth/google')) return 'vendor-google-auth';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('zustand') || id.includes('uuid')) return 'vendor-utils';

            // CAMBIO: NUEVO. Mayores ocupantes del cajón genérico 'vendor'
            // (visto con rollup-plugin-visualizer) — separarlos permite que el
            // navegador los cachee de forma independiente entre despliegues.
            if (id.includes('core-js')) return 'vendor-corejs';
            if (id.includes('/lodash/')) return 'vendor-lodash';
            if (id.includes('html2canvas')) return 'vendor-html2canvas';
            return 'vendor';
          },
        },
      },
    },
  };
});