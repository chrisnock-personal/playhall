import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client lives in src/client and is built into dist/client, which the
// server serves as static files. In dev, Vite proxies the API and the
// WebSocket to the server (npm run dev:server, port 8450).
export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8450' },
      '/ws': { target: 'ws://localhost:8450', ws: true },
    },
  },
});
