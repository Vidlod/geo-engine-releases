import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
    // El asistente convierte documentos contra el backend Flask (server.py).
    proxy: {
      '/api': 'http://127.0.0.1:5001',
    },
  },
});
