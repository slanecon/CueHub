import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    {
      // WKWebView + Swifter has no CORS headers, so type="module" crossorigin
      // causes the script to be blocked. Strip those attrs from the built HTML.
      name: 'strip-module-crossorigin',
      apply: 'build' as const,
      transformIndexHtml: {
        order: 'post' as const,
        handler(html: string) {
          // Keep defer so the script runs after DOM is parsed (same behaviour as type="module")
          return html.replace(/<script type="module" crossorigin/g, '<script defer')
        }
      }
    }
  ],
  root: 'web',
  build: {
    minify: false,
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        assetFileNames: (info) => info.name?.endsWith('.css') ? 'style.css' : '[name][extname]',
        format: 'iife',
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