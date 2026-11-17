import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // PDF libraries are big by nature; each tool is lazy-loaded, so the home page stays small.
    chunkSizeWarningLimit: 1600,
  },
})
