import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import versionPlugin from './vite-plugin-version.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionPlugin()],
  server: {
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      }
    }
  }
})
