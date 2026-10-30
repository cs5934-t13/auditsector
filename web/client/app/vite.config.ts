import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The nginx container proxies /api/ to the Flask server, stripping the prefix
// and reporting it in X-Forwarded-Prefix (see web/client/web.conf). Mirror both
// behaviours here so the front-end and the API behave the same in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // Matches the nginx config: Flask uses this to build /api/... URLs.
        headers: { 'X-Forwarded-Prefix': '/api' },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
