import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const refDir = fileURLToPath(new URL('./source-assets', import.meta.url))

// GitHub Pages serves the site from /hone-how-it-works/; dev stays at the root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? (process.env.BASE_PATH ?? '/hone-how-it-works/') : '/',
  server: { port: 5230, strictPort: true },
  preview: { port: 5231, strictPort: true },
  define: { __REF_DIR__: JSON.stringify(command === 'build' ? '' : refDir) },
}))
