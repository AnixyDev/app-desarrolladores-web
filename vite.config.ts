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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // manualChunks como FUNCIÓN (requerido por Rolldown en Vite 8)
        // Mantiene exactamente la misma segmentación que tenías antes
        manualChunks(id) {
          if (!id.includes('node_modules')) return; // deja el código propio en el chunk por defecto

          if (id.includes('react-router-dom') || id.includes('/react-dom/') || id.includes('/react/')) {
            return 'vendor-react';
          }
          if (id.includes('recharts')) {
            return 'vendor-recharts';
          }
          if (id.includes('jspdf')) {
            return 'vendor-pdf';
          }
          if (id.includes('@stripe/stripe-js') || id.includes('@stripe/react-stripe-js')) {
            return 'vendor-stripe';
          }
          if (id.includes('@google/generative-ai')) {
            return 'vendor-ai';
          }
          if (id.includes('marked')) {
            return 'vendor-markdown';
          }
          if (id.includes('@dnd-kit')) {
            return 'vendor-dnd';
          }
          if (id.includes('@supabase/supabase-js')) {
            return 'vendor-supabase';
          }
          // el resto de node_modules cae en un vendor genérico
          return 'vendor';
        },
      },
    },
  },
});
