import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/new_tree': 'http://127.0.0.1:8000',
      '/get_trees': 'http://127.0.0.1:8000',
      '/prune_tree': 'http://127.0.0.1:8000',
      '/new_branches': 'http://127.0.0.1:8000',
    }
  }
})
