import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite otherwise reads .env from apps/web, but the repo keeps one env file at the
// root (shared with the API). Without this, VITE_API_URL is undefined and the app
// silently falls back to the wrong port, which surfaces as "Failed to fetch".
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: { port: 5173, strictPort: true },
});
