import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check if packages are in root node_modules (monorepo) or local node_modules (standalone)
const rootPrismui = path.resolve(__dirname, '../../node_modules/@prismui/react');
const localPrismui = path.resolve(__dirname, 'node_modules/@prismui/react');
const useMonorepoAliases = fs.existsSync(rootPrismui) && !fs.existsSync(localPrismui);

const aliases = [
  // Node built-in stubs for fhir-runtime's server-only IG extraction code
  { find: 'node:fs/promises', replacement: path.resolve(__dirname, 'src/lib/node-stubs/fs.ts') },
  { find: 'node:fs', replacement: path.resolve(__dirname, 'src/lib/node-stubs/fs.ts') },
  { find: 'node:path', replacement: path.resolve(__dirname, 'src/lib/node-stubs/path.ts') },
  { find: 'node:url', replacement: path.resolve(__dirname, 'src/lib/node-stubs/url.ts') },
];

// Add aliases based on package location
if (useMonorepoAliases) {
  // Monorepo: packages in root node_modules
  aliases.unshift(
    { find: '@prismui/react', replacement: path.resolve(__dirname, '../../node_modules/@prismui/react/dist/esm/index.mjs') },
    { find: '@prismui/core', replacement: path.resolve(__dirname, '../../node_modules/@prismui/core/dist/esm/index.mjs') },
    { find: 'fhir-runtime', replacement: path.resolve(__dirname, '../../node_modules/fhir-runtime/dist/esm/index.mjs') }
  );
} else {
  // Standalone: packages in local node_modules (bypass @prismui exports field issue)
  aliases.unshift(
    { find: '@prismui/react', replacement: path.resolve(__dirname, 'node_modules/@prismui/react/dist/esm/index.mjs') },
    { find: '@prismui/core', replacement: path.resolve(__dirname, 'node_modules/@prismui/core/dist/esm/index.mjs') },
    { find: 'fhir-runtime', replacement: path.resolve(__dirname, 'node_modules/fhir-runtime/dist/esm/index.mjs') }
  );
}

export default defineConfig({
  plugins: [react()],
  base: '/',
  publicDir: 'public',
  resolve: {
    alias: aliases,
    conditions: ['browser', 'default'],
    mainFields: ['module', 'main', 'browser'],
  },
  optimizeDeps: {
    include: ['@prismui/core', '@prismui/react', 'fhir-runtime', 'fhir-rest-client'],
  },
  server: {
    port: 3000,
  },
});