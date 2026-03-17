import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  plugins: [
    devtools(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-heavy': [
                'zod',
                'react-day-picker',
                '@floating-ui/react',
                'lucide-react',
                'fuse.js',
              ],
            },
          },
        },
      },
    },
  },
  server: {
    hmr: {
      protocol: 'wss',
      host: 'tele.view',
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path: string) => path.replace(/^\/api/, ''),
      },
    },
  },
})

export default config
