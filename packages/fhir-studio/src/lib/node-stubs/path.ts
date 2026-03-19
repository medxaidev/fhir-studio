/**
 * Browser stub for node:path.
 * Minimal implementation for fhir-runtime's IG extraction code that is
 * never actually called in the browser.
 */

export function join(...parts: string[]): string {
  return parts.join('/');
}

export function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.substring(0, idx) : '.';
}

export default { join, dirname };
