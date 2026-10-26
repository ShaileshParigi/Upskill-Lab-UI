import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = 'http://127.0.0.1:4321';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 4322,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
