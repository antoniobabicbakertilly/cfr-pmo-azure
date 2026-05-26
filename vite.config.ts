import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    port: 3000,
  },
  resolve: {
    alias: [
      {
        // Redirect all @microsoft/power-apps/* imports to the local stub so the
        // build succeeds after the npm package is removed. Demo mode gates every
        // caller before these stubs are reached at runtime.
        find: /^@microsoft\/power-apps(\/.*)?$/,
        replacement: r('./src/lib/powerAppsShim.ts'),
      },
    ],
  },
})
