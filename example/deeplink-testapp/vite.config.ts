import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  plugins: [vue()],
})
