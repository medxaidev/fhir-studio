/**
 * PKCE (Proof Key for Code Exchange) Utilities
 *
 * Uses Web Crypto API — works in Browser + Node.js 18+.
 *
 * @module fhir-client/auth
 */

// =============================================================================
// Section 1: PKCE Challenge
// =============================================================================

/**
 * Generate a PKCE code verifier and SHA-256 code challenge.
 *
 * @returns Object with `codeVerifier` (random base64url) and `codeChallenge` (S256 hash).
 */
export async function generatePkceChallenge(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = base64UrlEncode(array);

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));

  return { codeVerifier, codeChallenge };
}

// =============================================================================
// Section 2: Helpers
// =============================================================================

/**
 * Base64url encode a Uint8Array (no padding, URL-safe).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
