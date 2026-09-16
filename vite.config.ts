import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // Deezer's API doesn't send Access-Control-Allow-Origin, so browser requests are
      // blocked by CORS. This app has no production deployment (dev-server only, like the
      // PKCE redirect_uri), so a dev-only proxy is sufficient rather than a hosted backend.
      '/api/deezer': {
        target: 'https://api.deezer.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deezer/, ''),
      },
    },
  },
})
