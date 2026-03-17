/**
 * FhirClient — Main Class
 *
 * Integrates all subsystems: Transport, Auth, Cache, Retry, Batch,
 * Query, and Subscription into a single unified FHIR HTTP SDK.
 *
 * @module fhir-client/client
 */

import type {
  Resource,
  Bundle,
  OperationOutcome,
  CapabilityStatement,
  JsonPatch,
  FhirClientOptions,
  AuthCredentials,
  LoginState,
  SearchParams,
  RequestOptions,
  ResourceArray,
} from "../types/index.js";
import { FhirClientError } from "../errors/errors.js";
import { HttpTransport } from "../transport/http-transport.js";
import { AuthManager } from "../auth/auth-manager.js";
import { TokenStore } from "../auth/token-store.js";
import { ResourceCache } from "../cache/resource-cache.js";
import { RetryHandler } from "../retry/retry-handler.js";
import { AutoBatcher } from "../batch/auto-batcher.js";
import { SearchParamsBuilder } from "../query/search-params-builder.js";
import { ClientSubscriptionManager } from "../subscription/subscription-manager.js";

// =============================================================================
// Section 1: FhirClient
// =============================================================================

export class FhirClient {
  private readonly baseUrl: string;
  private readonly transport: HttpTransport;
  private readonly auth: AuthManager;
  private readonly cache: ResourceCache;
  private readonly retry: RetryHandler;
  private readonly batcher: AutoBatcher;

  /** Access the subscription manager. */
  readonly subscriptions: ClientSubscriptionManager;

  constructor(options: FhirClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");

    // Auth
    const tokenStore = new TokenStore(options.auth?.tokenStorage);
    this.auth = new AuthManager({
      tokenStore,
      refreshGracePeriod: options.auth?.refreshGracePeriod,
      onUnauthenticated: options.onUnauthenticated,
    });

    // Transport
    this.transport = new HttpTransport({
      fetchImpl: options.fetchImpl,
      defaultHeaders: options.defaultHeaders,
      getAccessToken: () => this.auth.getAccessToken(),
    });
    this.auth.bind(this.transport, this.baseUrl);

    // Cache
    this.cache = new ResourceCache(this.baseUrl, options.cache);

    // Retry
    this.retry = new RetryHandler(options.retry);

    // Auto-Batch
    this.batcher = new AutoBatcher(options.batch);
    this.batcher.bind((bundle) => this.executeBatch(bundle));

    // Subscription
    this.subscriptions = new ClientSubscriptionManager();

    // Apply initial credentials if provided
    if (options.auth?.credentials) {
      const creds = options.auth.credentials;
      if (creds.type === "bearer") {
        this.auth.signIn(creds);
      }
      // Other credential types require async signIn — user must call client.signIn()
    }
  }

  // ===========================================================================
  // Auth Methods
  // ===========================================================================

  async signIn(credentials: AuthCredentials): Promise<LoginState> {
    return this.auth.signIn(credentials);
  }

  signOut(): void {
    this.auth.signOut();
    this.cache.clear();
  }

  getAccessToken(): string | undefined {
    return this.auth.getAccessToken();
  }

  async getProfile(): Promise<Resource | undefined> {
    const state = this.auth.getLoginState();
    if (!state) return undefined;
    // Try to read the profile from /auth/me or similar
    try {
      return await this.request<Resource>("GET", `${this.baseUrl}/auth/me`);
    } catch {
      return undefined;
    }
  }

  // ===========================================================================
  // CRUD Methods
  // ===========================================================================

  async createResource<T extends Resource>(
    resourceType: string,
    resource: T,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}`;
    const result = await this.request<T>("POST", url, {
      body: JSON.stringify(resource),
      signal: options?.signal,
      headers: options?.headers,
    });
    this.cache.invalidateSearches(resourceType);
    return result;
  }

  async readResource<T extends Resource>(
    resourceType: string,
    id: string,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    return this.cachedGet<T>(url, options);
  }

  async updateResource<T extends Resource>(
    resourceType: string,
    id: string,
    resource: T,
    options?: RequestOptions,
  ): Promise<T> {
    if (!id) {
      throw new FhirClientError("Resource must have an id for update");
    }
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const result = await this.request<T>("PUT", url, {
      body: JSON.stringify(resource),
      signal: options?.signal,
      headers: options?.headers,
    });
    this.cache.cacheResource(result);
    this.cache.invalidateSearches(resourceType);
    return result;
  }

  async patchResource<T extends Resource>(
    resourceType: string,
    id: string,
    patch: JsonPatch[],
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const result = await this.request<T>("PATCH", url, {
      body: JSON.stringify(patch),
      headers: {
        "content-type": "application/json-patch+json",
        ...options?.headers,
      },
      signal: options?.signal,
    });
    this.cache.cacheResource(result);
    this.cache.invalidateSearches(resourceType);
    return result;
  }

  async deleteResource(
    resourceType: string,
    id: string,
    options?: RequestOptions,
  ): Promise<void> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    await this.request<unknown>("DELETE", url, {
      signal: options?.signal,
      headers: options?.headers,
    });
    this.cache.invalidateResource(resourceType, id);
  }

  // ===========================================================================
  // Search Methods
  // ===========================================================================

  async search<T extends Resource>(
    resourceType: string,
    params?: SearchParams,
    options?: RequestOptions,
  ): Promise<Bundle<T>> {
    const url = new URL(`${this.baseUrl}/${resourceType}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, v);
        } else {
          url.searchParams.set(key, value);
        }
      }
    }
    return this.cachedGet<Bundle<T>>(url.toString(), options);
  }

  async searchResources<T extends Resource>(
    resourceType: string,
    params?: SearchParams,
    options?: RequestOptions,
  ): Promise<ResourceArray<T>> {
    const bundle = await this.search<T>(resourceType, params, options);
    return bundleToResourceArray(bundle);
  }

  async *searchResourcePages<T extends Resource>(
    resourceType: string,
    params?: SearchParams,
    options?: RequestOptions,
  ): AsyncGenerator<ResourceArray<T>> {
    let bundle = await this.search<T>(resourceType, params, options);
    yield bundleToResourceArray(bundle);

    let nextUrl = bundle.link?.find((l) => l.relation === "next")?.url;
    while (nextUrl) {
      bundle = await this.cachedGet<Bundle<T>>(nextUrl, options);
      yield bundleToResourceArray(bundle);
      nextUrl = bundle.link?.find((l) => l.relation === "next")?.url;
    }
  }

  // ===========================================================================
  // History Methods
  // ===========================================================================

  async readHistory<T extends Resource>(
    resourceType: string,
    id: string,
    options?: RequestOptions,
  ): Promise<Bundle<T>> {
    const url = `${this.baseUrl}/${resourceType}/${id}/_history`;
    return this.cachedGet<Bundle<T>>(url, options);
  }

  async readVersion<T extends Resource>(
    resourceType: string,
    id: string,
    versionId: string,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}/_history/${versionId}`;
    return this.cachedGet<T>(url, options);
  }

  // ===========================================================================
  // Operation Methods
  // ===========================================================================

  async operation<R = Resource>(
    path: string,
    params?: Resource,
    options?: RequestOptions,
  ): Promise<R> {
    const url = `${this.baseUrl}/${path}`;
    if (params) {
      return this.request<R>("POST", url, {
        body: JSON.stringify(params),
        signal: options?.signal,
        headers: options?.headers,
      });
    }
    return this.request<R>("GET", url, {
      signal: options?.signal,
      headers: options?.headers,
    });
  }

  async executeBatch(bundle: Bundle, options?: RequestOptions): Promise<Bundle> {
    return this.request<Bundle>("POST", this.baseUrl, {
      body: JSON.stringify(bundle),
      signal: options?.signal,
      headers: options?.headers,
    });
  }

  // ===========================================================================
  // Validate
  // ===========================================================================

  async validateResource(resource: Resource): Promise<OperationOutcome> {
    const url = `${this.baseUrl}/${resource.resourceType}/$validate`;
    return this.request<OperationOutcome>("POST", url, {
      body: JSON.stringify(resource),
    });
  }

  // ===========================================================================
  // Binary Support
  // ===========================================================================

  async createBinary(
    data: string | Blob | ArrayBuffer,
    contentType: string,
  ): Promise<Resource> {
    await this.auth.refreshIfExpired();
    const response = await this.transport.rawRequest({
      method: "POST",
      url: `${this.baseUrl}/Binary`,
      body: data as BodyInit,
      headers: { "content-type": contentType },
    });
    if (!response.ok) {
      throw new FhirClientError(
        `Failed to upload Binary: ${response.statusText}`,
        response.status,
      );
    }
    const text = await response.text();
    return JSON.parse(text) as Resource;
  }

  async readBinary(id: string): Promise<Blob> {
    await this.auth.refreshIfExpired();
    const response = await this.transport.rawRequest({
      method: "GET",
      url: `${this.baseUrl}/Binary/${id}`,
    });
    if (!response.ok) {
      throw new FhirClientError(
        `Failed to download Binary/${id}: ${response.statusText}`,
        response.status,
      );
    }
    return response.blob();
  }

  // ===========================================================================
  // Capability / Metadata
  // ===========================================================================

  async getCapabilities(): Promise<CapabilityStatement> {
    const url = `${this.baseUrl}/metadata`;
    return this.cachedGet<CapabilityStatement>(url);
  }

  // ===========================================================================
  // Query Builder
  // ===========================================================================

  buildSearchParams(): SearchParamsBuilder {
    return new SearchParamsBuilder();
  }

  // ===========================================================================
  // Cache Access
  // ===========================================================================

  getCached<T extends Resource>(resourceType: string, id: string): T | undefined {
    return this.cache.getCachedResource<T>(resourceType, id);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  // ===========================================================================
  // Auto-Batch Control
  // ===========================================================================

  setAutoBatch(enabled: boolean): void {
    this.batcher.setEnabled(enabled);
  }

  async flushBatch(): Promise<void> {
    return this.batcher.flush();
  }

  // ===========================================================================
  // PKCE (static)
  // ===========================================================================

  static generatePkceChallenge = async () => {
    const { generatePkceChallenge } = await import("../auth/pkce.js");
    return generatePkceChallenge();
  };

  // ===========================================================================
  // Internal: Request Pipeline
  // ===========================================================================

  private async request<T>(
    method: string,
    url: string,
    options?: {
      body?: string | BodyInit;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    await this.auth.refreshIfExpired();

    const response = await this.retry.execute(() =>
      this.transport.rawRequest({
        method,
        url,
        body: options?.body,
        headers: options?.headers,
        signal: options?.signal,
      }),
    );

    // Handle 401 — attempt refresh and retry
    if (response.status === 401) {
      const refreshed = await this.auth.handleUnauthorized();
      if (refreshed) {
        const retryResponse = await this.transport.rawRequest({
          method,
          url,
          body: options?.body,
          headers: options?.headers,
          signal: options?.signal,
        });
        return this.parseResponse<T>(retryResponse);
      }
    }

    return this.parseResponse<T>(response);
  }

  private async cachedGet<T>(url: string, options?: RequestOptions): Promise<T> {
    const cached = this.cache.get<T>(url, options);
    if (cached !== undefined) return cached;

    const result = await this.request<T>("GET", url, {
      signal: options?.signal,
      headers: options?.headers,
    });

    this.cache.set(url, result);
    return result;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown;

    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      if (!response.ok) {
        throw new FhirClientError(
          `Invalid JSON response: ${text.slice(0, 200)}`,
          response.status,
        );
      }
      return text as unknown as T;
    }

    if (!response.ok) {
      const outcome = isOperationOutcome(body) ? body : undefined;
      const message =
        outcome?.issue?.[0]?.diagnostics ??
        outcome?.issue?.[0]?.details?.text ??
        `HTTP ${response.status} ${response.statusText}`;
      throw new FhirClientError(message, response.status, outcome);
    }

    return body as T;
  }
}

// =============================================================================
// Section 2: Helpers
// =============================================================================

function isOperationOutcome(value: unknown): value is OperationOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).resourceType === "OperationOutcome"
  );
}

function bundleToResourceArray<T extends Resource>(
  bundle: Bundle<T>,
): ResourceArray<T> {
  const resources = (
    (bundle.entry
      ?.map((e) => e.resource)
      .filter((r): r is T => r !== undefined)) ?? []
  );
  const arr = resources as ResourceArray<T>;
  arr.bundle = bundle;
  return arr;
}
