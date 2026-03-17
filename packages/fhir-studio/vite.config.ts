import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/',
  publicDir: 'public',
  resolve: {
    alias: [
      { find: '@prismui/react', replacement: path.resolve(__dirname, 'node_modules/@prismui/react/dist/esm/index.mjs') },
      { find: '@prismui/core', replacement: path.resolve(__dirname, 'node_modules/@prismui/core/dist/esm/index.mjs') },
      { find: /^node:fs\/promises$/, replacement: path.resolve(__dirname, 'src/shims/node-fs.ts') },
      { find: /^node:fs$/, replacement: path.resolve(__dirname, 'src/shims/node-fs.ts') },
      { find: /^node:path$/, replacement: path.resolve(__dirname, 'src/shims/node-path.ts') },
      { find: /^node:url$/, replacement: path.resolve(__dirname, 'src/shims/node-url.ts') },
    ],
    conditions: ['browser', 'default'],
  },
  optimizeDeps: {
    include: ['@prismui/core', '@prismui/react', 'fhir-runtime', 'fhir-definition'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'r4-profiles': ['./src/data/r4-profiles.json'],
          'us-core-profiles': ['./src/data/us-core-profiles.json'],
        },
      },
    },
    assetsInlineLimit: 0,
    modulePreload: {
      resolveDependencies: (filename, deps, { hostId, hostType }) => {
        return deps;
      },
    },
  },
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      return '/' + filename;
    },
  },
  server: {
    port: 3000,
  },
});