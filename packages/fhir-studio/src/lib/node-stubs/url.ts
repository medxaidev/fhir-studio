/**
 * Browser stub for node:url.
 * fhir-runtime imports fileURLToPath which is never called in the browser.
 */

export function fileURLToPath(url: string): string {
  return url.replace(/^file:\/\//, '');
}

export default { fileURLToPath };
