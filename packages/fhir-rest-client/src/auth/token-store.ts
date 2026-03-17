/**
 * Token Storage
 *
 * Abstracts token persistence with Memory and LocalStorage implementations.
 *
 * @module fhir-client/auth
 */

import type { TokenStorage, LoginState } from "../types/index.js";

// =============================================================================
// Section 1: Keys
// =============================================================================

const KEY_ACCESS = "fhir_access_token";
const KEY_REFRESH = "fhir_refresh_token";
const KEY_EXPIRES = "fhir_expires_at";

// =============================================================================
// Section 2: MemoryTokenStorage
// =============================================================================

/**
 * In-memory token storage (default for Node.js and tests).
 */
export class MemoryTokenStorage implements TokenStorage {
  private store = new Map<string, string>();

  get(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

// =============================================================================
// Section 3: LocalStorageTokenStorage
// =============================================================================

/**
 * Browser localStorage token storage.
 */
export class LocalStorageTokenStorage implements TokenStorage {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage may be unavailable (e.g., private browsing)
    }
  }

  delete(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

// =============================================================================
// Section 4: TokenStore (high-level wrapper)
// =============================================================================

/**
 * High-level wrapper around TokenStorage for managing login state.
 */
export class TokenStore {
  private readonly storage: TokenStorage;

  constructor(storage?: TokenStorage) {
    this.storage = storage ?? new MemoryTokenStorage();
  }

  getLoginState(): LoginState | undefined {
    const accessToken = this.storage.get(KEY_ACCESS);
    if (!accessToken) return undefined;

    const refreshToken = this.storage.get(KEY_REFRESH) ?? undefined;
    const expiresStr = this.storage.get(KEY_EXPIRES);
    const expiresAt = expiresStr ? parseInt(expiresStr, 10) : undefined;

    return { accessToken, refreshToken, expiresAt };
  }

  setLoginState(state: LoginState): void {
    this.storage.set(KEY_ACCESS, state.accessToken);
    if (state.refreshToken) {
      this.storage.set(KEY_REFRESH, state.refreshToken);
    }
    if (state.expiresAt !== undefined) {
      this.storage.set(KEY_EXPIRES, String(state.expiresAt));
    }
  }

  getAccessToken(): string | undefined {
    return this.storage.get(KEY_ACCESS) ?? undefined;
  }

  getRefreshToken(): string | undefined {
    return this.storage.get(KEY_REFRESH) ?? undefined;
  }

  getExpiresAt(): number | undefined {
    const v = this.storage.get(KEY_EXPIRES);
    return v ? parseInt(v, 10) : undefined;
  }

  clear(): void {
    this.storage.delete(KEY_ACCESS);
    this.storage.delete(KEY_REFRESH);
    this.storage.delete(KEY_EXPIRES);
  }
}
