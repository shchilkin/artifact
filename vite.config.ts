import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-plugin-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // App chunks are kept below the default warning threshold. Three.js is
    // isolated as a vendor chunk and sits just over 500 kB minified.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-vendor',
              test: /node_modules[\\/]three[\\/]/,
              priority: 35,
            },
            {
              name: 'pixi-vendor',
              test: /node_modules[\\/](pixi\.js|@pixi)[\\/]/,
              priority: 30,
            },
            {
              name: 'flow-vendor',
              test: /node_modules[\\/](@xyflow|d3-)/,
              priority: 25,
            },
            {
              name: 'motion-vendor',
              test: /node_modules[\\/]framer-motion[\\/]/,
              priority: 20,
            },
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router|@react-router)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@xyflow/react', '@xstate/react'],
  },
});
