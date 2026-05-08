import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// Tauri expects a fixed port and disables HMR when on a slow connection.
// 1420 is the Tauri default; keep it so `tauri dev` can find the dev server.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
  },
  envPrefix: ['VITE_', 'TAURI_'],
  // Inline the package.json version into the bundle so the WhatsNewModal
  // can show the right "Updated to vX" headline without a runtime fetch.
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
  },
})
