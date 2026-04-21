import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, existsSync } from 'fs'

// ── Plugin: copy axe-core's pre-built bundle into dist/ ──────────────────────
// axe.min.js is injected into reference tabs at runtime via chrome.scripting.
// It must live as a flat file in dist/ (not bundled) so Chrome can load it.
const copyAxePlugin = {
  name: 'copy-axe-core',
  closeBundle() {
    const src  = resolve(__dirname, 'node_modules/axe-core/axe.min.js')
    const dest = resolve(__dirname, 'dist/axe.min.js')
    if (existsSync(src)) {
      copyFileSync(src, dest)
      console.log('✓  axe-core → dist/axe.min.js')
    } else {
      console.warn('⚠  axe-core not found — run: npm install axe-core')
    }
  },
}

export default defineConfig({
  plugins: [react(), copyAxePlugin],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          // Keep background and content as flat JS files (Chrome requires this)
          if (chunk.name === 'background' || chunk.name === 'content') {
            return '[name].js'
          }
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
