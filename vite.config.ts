import { defineConfig } from 'vite'
import { reactRouter } from '@react-router/dev/vite'
import tsconfigPaths from 'vite-plugin-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  optimizeDeps: {
    include: ['@xyflow/react'],
  },
})
