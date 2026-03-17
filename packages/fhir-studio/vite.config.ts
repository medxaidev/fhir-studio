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
    ],
    conditions: ['browser', 'default'],
  },
  optimizeDeps: {
    include: ['@prismui/core', '@prismui/react', 'fhir-rest-client'],
  },
  server: {
    port: 3000,
  },
});