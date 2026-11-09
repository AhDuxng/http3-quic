/**
 * Vite configuration. The development server (port 5173) proxies /api and the
 * media paths to VITE_PROXY_TARGET (default https://localhost), so the UI can
 * run with hot reload against a running proxy stack.
 */

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'https://localhost'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/media': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/media-2': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/video': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
