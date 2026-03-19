/**
 * vite.config.js - Cau hinh Vite cho frontend.
 *
 * Dev proxy: chuyen /api va /media ve backend de tranh CORS khi chay local.
 * VITE_PROXY_TARGET doc tu .env, mac dinh la https://localhost (Caddy local).
 */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Doc bien moi truong tu file .env tuong ung voi mode (development/production)
  const env = loadEnv(mode, '.', '')

  // URL cua Caddy/backend ma Vite se proxy den khi chay dev server
  const proxyTarget = env.VITE_PROXY_TARGET || 'https://localhost'

  return {
    plugins: [react()],
    server: {
      host: true,        // Lang nghe tren 0.0.0.0 de truy cap tu Docker
      port: 5173,
      strictPort: true,  // Loi ngay neu port da bi chiem, khong tu chuyen port
      allowedHosts: true,
      proxy: {
        // Proxy API: /api/* -> backend (qua Caddy)
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false, // Chap nhan self-signed cert o local
        },
        // Proxy media: /media/* -> Caddy file server
        '/media': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        // Proxy media-2: /media-2/* -> backend file server
        '/media-2': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
