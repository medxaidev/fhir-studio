import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: [
      { find: 'fhir-rest-client', replacement: path.resolve(__dirname, '../fhir-rest-client/dist/esm/index.mjs') },
      { find: 'fhir-runtime', replacement: path.resolve(__dirname, '../../node_modules/fhir-runtime/dist/esm/index.mjs') },
    ],
  },
});
