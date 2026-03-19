/**
 * Browser stub for node:fs / node:fs/promises.
 * fhir-runtime bundles server-only IG extraction code that imports these.
 * These functions are never called in the browser — only the profile-building
 * and utility functions are used. This stub prevents the Vite build from failing.
 */

function notAvailable(): never {
  throw new Error('node:fs is not available in the browser');
}

export const readFileSync = notAvailable;
export const existsSync = () => false;
export const readdirSync = () => [];
export const statSync = notAvailable;
export const readFile = () => Promise.reject(new Error('node:fs is not available in the browser'));

export default {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  readFile,
  promises: { readFile },
};
