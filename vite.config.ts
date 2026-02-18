import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: 'web',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        assetFileNames: (info) => info.name?.endsWith('.css') ? 'style.css' : '[name][extname]',
        inlineDynamicImports: true,
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
    }
  }
})