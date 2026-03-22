import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },

  build: {
    sourcemap: true,

    // Subimos el límite de aviso a 600 KB (el estándar razonable con source maps)
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        manualChunks: {
          // React core — siempre en caché una vez descargado
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Gráficos — solo se descarga cuando el usuario visita páginas con charts
          'vendor-recharts': ['recharts'],

          // PDF — solo cuando se genera un PDF
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],

          // Stripe — solo en páginas de pago
          'vendor-stripe': ['@stripe/stripe-js', '@stripe/react-stripe-js'],

          // Gemini / Google AI — solo en páginas de IA
          'vendor-ai': ['@google/generative-ai'],

          // Markdown — solo en páginas que renderizan markdown
          'vendor-markdown': ['marked'],

          // DnD — solo en páginas con drag & drop
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],

          // Supabase
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
