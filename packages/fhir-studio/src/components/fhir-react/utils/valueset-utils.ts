/**
 * ValueSet expansion utilities.
 *
 * Tries admin endpoint first (reads from in-memory IG definitions — always
 * available), then falls back to standard FHIR $expand (reads from DB,
 * requires seeded conformance resources).
 *
 * @module fhir-react/utils/valueset-utils
 */

import { serverStore } from '../../../stores/server-store';

export interface ExpandedConcept {
  system?: string;
  code?: string;
  display?: string;
}

/**
 * Expand a ValueSet by URL, returning a flat list of concepts.
 * Tries /_admin/ig/valueset-expand first, falls back to client.expandValueSet().
 */
export async function expandValueSet(
  valueSetUrl: string,
  count = 200,
): Promise<ExpandedConcept[]> {
  const client = serverStore.getClient();
  if (!client) return [];

  // Strip FHIR version pipe (e.g. |4.0.1) — server lookups use canonical URL without version
  const url = valueSetUrl.includes('|') ? valueSetUrl.split('|')[0] : valueSetUrl;

  // 1. Try admin endpoint (in-memory definitions — always available, no 404 noise)
  try {
    const baseUrl = client.getBaseUrl();
    const adminUrl = `${baseUrl}/_admin/ig/valueset-expand?url=${encodeURIComponent(url)}&count=${count}`;
    const resp = await fetch(adminUrl);
    if (resp.ok) {
      const data = await resp.json() as Record<string, unknown>;
      const expansion = data.expansion as Record<string, unknown> | undefined;
      const entries = (expansion?.contains ?? []) as ExpandedConcept[];
      if (entries.length > 0) return entries;
    }
  } catch {
    // Admin endpoint not available, try standard $expand
  }

  // 2. Fallback: standard FHIR $expand (reads from DB)
  try {
    const vs = await client.expandValueSet({ url, count });
    const expansion = (vs as Record<string, unknown>).expansion as Record<string, unknown> | undefined;
    const entries = (expansion?.contains ?? []) as ExpandedConcept[];
    if (entries.length > 0) return entries;
  } catch {
    // Both methods failed
  }

  return [];
}
