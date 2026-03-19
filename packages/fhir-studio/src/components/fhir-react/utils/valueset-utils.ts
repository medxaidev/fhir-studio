/**
 * ValueSet expansion utilities.
 *
 * Tries standard FHIR $expand first, falls back to admin endpoint
 * which reads from in-memory definitions (vsByUrl + csByUrl).
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
 * Tries client.expandValueSet() first, falls back to /_admin/ig/valueset-expand.
 */
export async function expandValueSet(
  valueSetUrl: string,
  count = 200,
): Promise<ExpandedConcept[]> {
  const client = serverStore.getClient();
  if (!client) return [];

  // 1. Try standard FHIR $expand
  try {
    const vs = await client.expandValueSet({ url: valueSetUrl, count });
    const expansion = (vs as Record<string, unknown>).expansion as Record<string, unknown> | undefined;
    const entries = (expansion?.contains ?? []) as ExpandedConcept[];
    if (entries.length > 0) return entries;
  } catch {
    // Standard $expand not available, try admin fallback
  }

  // 2. Fallback: admin endpoint (reads from in-memory definitions)
  try {
    const baseUrl = client.getBaseUrl();
    const url = `${baseUrl}/_admin/ig/valueset-expand?url=${encodeURIComponent(valueSetUrl)}&count=${count}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json() as Record<string, unknown>;
      const expansion = data.expansion as Record<string, unknown> | undefined;
      return (expansion?.contains ?? []) as ExpandedConcept[];
    }
  } catch {
    // Both methods failed
  }

  return [];
}
