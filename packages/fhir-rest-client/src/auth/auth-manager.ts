/**
 * Auth Manager
 *
 * Token lifecycle management: signIn, signOut, auto-refresh, 401 retry.
 * Ported from MedXAIClient auth logic with modular architecture.
 *
 * @module fhir-client/auth
 */

import type {
  AuthCredentials,
  LoginState,
  LoginResponse,
  TokenResponse,
} from "../types/index.js";
import type { HttpTransport } from "../transport/http-transport.js";
import { FhirClientError } from "../errors/errors.js";
import { TokenStore } from "./token-store.js";

// =============================================================================
// Section 1: AuthManager
// =============================================================================

export class AuthManager {
  private readonly tokenStore: TokenStore;
  private readonly refreshGracePeriod: number;
  private readonly onUnauthenticated?: () => void;

  /** Reference to transport — set after construction to avoid circular dependency. */
  private transport?: HttpTransport;
  private baseUrl = "";

  constructor(options: {
    tokenStore?: TokenStore;
    refreshGracePeriod?: number;
    onUnauthenticated?: () => void;
  } = {}) {
    this.tokenStore = options.tokenStore ?? new TokenStore();
    this.refreshGracePeriod = options.refreshGracePeriod ?? 300_000; // 5 min
    this.onUnauthenticated = options.onUnauthenticated;
  }

  /** Bind transport and baseUrl (called by FhirClient during init). */
  bind(transport: HttpTransport, baseUrl: string): void {
    this.transport = transport;
    this.baseUrl = baseUrl;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Sign in with the given credentials.
   */
  async signIn(credentials: AuthCredentials): Promise<LoginState> {
    switch (credentials.type) {
      case "bearer":
        return this.signInBearer(credentials);
      case "client":
        return this.signInClientCredentials(credentials);
      case "password":
        return this.signInPassword(credentials);
      case "pkce":
        throw new FhirClientError(
          "PKCE sign-in requires buildAuthUrl() + exchangeCode() flow",
        );
      default:
        throw new FhirClientError("Unknown credential type");
    }
  }

  /**
   * Sign out — clear all tokens.
   */
  signOut(): void {
    this.tokenStore.clear();
  }

  /**
   * Get current access token.
   */
  getAccessToken(): string | undefined {
    return this.tokenStore.getAccessToken();
  }

  /**
   * Get current login state.
   */
  getLoginState(): LoginState | undefined {
    return this.tokenStore.getLoginState();
  }

  /**
   * Refresh access token if expired or about to expire.
   * Called before every request.
   */
  async refreshIfExpired(): Promise<void> {
    const expiresAt = this.tokenStore.getExpiresAt();
    const refreshToken = this.tokenStore.getRefreshToken();
    if (!expiresAt || !refreshToken) return;
    if (Date.now() < expiresAt - this.refreshGracePeriod) return;

    try {
      await this.refreshAccessToken();
    } catch {
      // Token refresh failed — continue with current token
    }
  }

  /**
   * Handle 401 response: attempt refresh → retry → onUnauthenticated.
   *
   * @returns true if refresh+retry succeeded, false if permanent failure.
   */
  async handleUnauthorized(): Promise<boolean> {
    const refreshToken = this.tokenStore.getRefreshToken();
    if (refreshToken) {
      try {
        await this.refreshAccessToken();
        return true;
      } catch {
        // Refresh failed
      }
    }

    // Permanent auth failure
    this.signOut();
    this.onUnauthenticated?.();
    return false;
  }

  /**
   * Refresh the access token using the stored refresh token.
   */
  async refreshAccessToken(): Promise<LoginState> {
    const refreshToken = this.tokenStore.getRefreshToken();
    if (!refreshToken) {
      throw new FhirClientError("No refresh token available");
    }

    const url = `${this.baseUrl}/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString();

    const response = await this.rawFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });

    const tokenResult = await this.parseJsonResponse<TokenResponse>(response);
    return this.storeTokens(tokenResult);
  }

  // ===========================================================================
  // PKCE Flow
  // ===========================================================================

  /**
   * Build the authorization URL for PKCE flow.
   */
  buildPkceAuthorizationUrl(options: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    scope?: string;
    state?: string;
  }): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      code_challenge: options.codeChallenge,
      code_challenge_method: "S256",
      scope: options.scope ?? "openid offline",
    });
    if (options.state) {
      params.set("state", options.state);
    }
    return `${this.baseUrl}/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code with PKCE verifier for tokens.
   */
  async exchangeCodeWithPkce(
    code: string,
    codeVerifier: string,
    redirectUri?: string,
  ): Promise<LoginState> {
    const url = `${this.baseUrl}/oauth2/token`;
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    };
    if (redirectUri) params.redirect_uri = redirectUri;

    const body = new URLSearchParams(params).toString();
    const response = await this.rawFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });

    const tokenResult = await this.parseJsonResponse<TokenResponse>(response);
    return this.storeTokens(tokenResult);
  }

  // ===========================================================================
  // Private: Sign-in Strategies
  // ===========================================================================

  private signInBearer(creds: {
    accessToken: string;
    refreshToken?: string;
  }): LoginState {
    const state: LoginState = {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
    };
    this.tokenStore.setLoginState(state);
    return state;
  }

  private async signInClientCredentials(creds: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
  }): Promise<LoginState> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }).toString();

    const response = await this.rawFetch(creds.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });

    const tokenResult = await this.parseJsonResponse<TokenResponse>(response);
    return this.storeTokens(tokenResult);
  }

  private async signInPassword(creds: {
    email: string;
    password: string;
  }): Promise<LoginState> {
    // Step 1: POST /auth/login
    const loginUrl = `${this.baseUrl}/auth/login`;
    const loginResponse = await this.rawFetch(loginUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email: creds.email,
        password: creds.password,
        scope: "openid offline",
      }),
    });
    const loginResult = await this.parseJsonResponse<LoginResponse>(loginResponse);

    // Step 2: POST /oauth2/token with authorization_code
    const tokenUrl = `${this.baseUrl}/oauth2/token`;
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: loginResult.code,
    }).toString();

    const tokenResponse = await this.rawFetch(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: tokenBody,
    });

    const tokenResult = await this.parseJsonResponse<TokenResponse>(tokenResponse);
    return this.storeTokens(tokenResult);
  }

  // ===========================================================================
  // Private: Helpers
  // ===========================================================================

  private storeTokens(tokenResult: TokenResponse): LoginState {
    const state: LoginState = {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token,
      expiresAt: tokenResult.expires_in
        ? Date.now() + tokenResult.expires_in * 1000
        : undefined,
    };
    this.tokenStore.setLoginState(state);
    return state;
  }

  private async rawFetch(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    // Use transport's underlying fetch if available, otherwise global
    if (this.transport) {
      return (this.transport as any).fetchFn(url, init);
    }
    return globalThis.fetch(url, init);
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown;

    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      throw new FhirClientError(
        `Invalid JSON response: ${text.slice(0, 200)}`,
        response.status,
      );
    }

    if (!response.ok) {
      const obj = body as Record<string, unknown> | undefined;
      const message =
        (obj?.error_description as string) ??
        (obj?.error as string) ??
        `HTTP ${response.status} ${response.statusText}`;
      throw new FhirClientError(message, response.status);
    }

    return body as T;
  }
}
