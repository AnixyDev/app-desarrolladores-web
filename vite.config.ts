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
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('react-router-dom') || id.includes('/react-dom/') || id.includes('/react/')) {
            return 'vendor-react';
          }
          if (id.includes('recharts')) return 'vendor-recharts';
          if (id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('@stripe/stripe-js') || id.includes('@stripe/react-stripe-js')) return 'vendor-stripe';
          if (id.includes('@google/generative-ai')) return 'vendor-ai';
          if (id.includes('marked')) return 'vendor-markdown';
          if (id.includes('@dnd-kit')) return 'vendor-dnd';
          if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
          if (id.includes('@react-oauth/google')) return 'vendor-google-auth';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('zustand') || id.includes('uuid')) return 'vendor-utils';

          return 'vendor';
        },
      },
    },
  },
});