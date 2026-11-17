import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Two ways to run the front-end:
 *
 * 1. `npm run dev` — Vite dev server on :5173 with hot module replacement. Edit
 *    any file under `src/` and the browser updates without a rebuild. This is
 *    the workflow to use while iterating on the UI.
 * 2. The container image — `npm run build` produces static assets that nginx
 *    serves on the pod's :8080.
 *
 * In dev mode `/api` is proxied to the running pod so the real session/settings
 * endpoints are used. The proxy deliberately targets nginx on :8080 rather than
 * Flask on :5000:
 *
 * - Flask is not published to the host (only the client container's port is),
 *   and macOS keeps :5000 bound to the AirPlay Receiver.
 * - nginx already strips the `/api` prefix and sends `X-Forwarded-Prefix`, so
 *   the path is forwarded unchanged. Rewriting here as well would strip it
 *   twice and every request would 404.
 *
 * Override the target with `VITE_API_TARGET` (for example when the pod is
 * published on another host or port).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.VITE_API_TARGET ?? 'http://localhost:8080';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Fail loudly instead of silently moving to :5174, so the documented URL
      // is always the one in use.
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // Matches the nginx config: Flask uses this to build /api/... URLs.
          headers: { 'X-Forwarded-Prefix': '/api' },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
