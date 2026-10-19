import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The proxy forwards /api, /uploads and websockets to the Express server, so the browser sees ONE origin
// (this also makes the httpOnly refresh-token cookie work without CORS headaches).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/sitemap.xml': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
