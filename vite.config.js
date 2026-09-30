import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const refDir = fileURLToPath(new URL('./source-assets', import.meta.url))

// Served from the root (Vercel, dev). The GitHub Pages deploy sets BASE_PATH=/hone-how-it-works/.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? (process.env.BASE_PATH ?? '/') : '/',
  server: { port: 5230, strictPort: true },
  preview: { port: 5231, strictPort: true },
  define: { __REF_DIR__: JSON.stringify(command === 'build' ? '' : refDir) },
}))
