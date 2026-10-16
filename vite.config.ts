import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:3001' },
    // API cache and test artifacts must not reload the page during a live scan.
    watch: { ignored: ['**/.data/**', '**/.qa/**'] },
  },
  preview: { proxy: { '/api': 'http://127.0.0.1:3001' } },
})
