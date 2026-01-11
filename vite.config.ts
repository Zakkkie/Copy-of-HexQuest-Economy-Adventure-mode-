
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL: Allows assets to load via file:// protocol in Electron
  server: {
    host: true,
    port: 5173
  }
})
