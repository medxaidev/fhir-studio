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
      { find: '@prismui/react', replacement: path.resolve(__dirname, '../../node_modules/@prismui/react/dist/esm/index.mjs') },
      { find: '@prismui/core', replacement: path.resolve(__dirname, '../../node_modules/@prismui/core/dist/esm/index.mjs') },
      { find: 'fhir-rest-client', replacement: path.resolve(__dirname, '../fhir-rest-client/dist/esm/index.mjs') },
      { find: 'fhir-runtime', replacement: path.resolve(__dirname, '../../node_modules/fhir-runtime/dist/esm/index.mjs') },
      // Node built-in stubs for fhir-runtime's server-only IG extraction code
      { find: 'node:fs/promises', replacement: path.resolve(__dirname, 'src/lib/node-stubs/fs.ts') },
      { find: 'node:fs', replacement: path.resolve(__dirname, 'src/lib/node-stubs/fs.ts') },
      { find: 'node:path', replacement: path.resolve(__dirname, 'src/lib/node-stubs/path.ts') },
      { find: 'node:url', replacement: path.resolve(__dirname, 'src/lib/node-stubs/url.ts') },
    ],
    conditions: ['browser', 'default'],
  },
  optimizeDeps: {
    include: ['@prismui/core', '@prismui/react', 'fhir-rest-client', 'fhir-runtime'],
  },
  server: {
    port: 3000,
  },
});