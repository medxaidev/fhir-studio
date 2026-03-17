/**
 * MedXAI FHIR Client
 *
 * TypeScript SDK for interacting with a MedXAI FHIR R4 server.
 * Provides typed CRUD operations, search, and history access.
 *
 * Uses the standard Fetch API — works in Node.js 18+ and browsers.
 *
 * @module fhir-client
 */

import type {
  FhirResource,
  Bundle,
  OperationOutcome,
  MedXAIClientConfig,
  LoginResponse,
  TokenResponse,
  SignInResult,
  PatchOperation,
  RequestOptions,
  ResourceArray,
  BatchQueueEntry,
} from "./types.js";
import { FhirClientError } from "./types.js";

// =============================================================================
// Section 1: Constants
// =============================================================================

const FHIR_JSON = "application/fhir+json";

// =============================================================================
// Section 2: MedXAIClient
// =============================================================================

/**
 * FHIR R4 client for the MedXAI server.
 *
 * @example
 * ```ts
 * const client = new MedXAIClient({ baseUrl: "http://localhost:8080" });
 *
 * // Create
 * const patient = await client.createResource({
 *   resourceType: "Patient",
 *   name: [{ family: "Smith", given: ["John"] }],
 * });
 *
 * // Read
 * const read = await client.readResource("Patient", patient.id!);
 *
 * // Search
 * const bundle = await client.search("Patient", { name: "Smith" });
 *
 * // Update
 * await client.updateResource({ ...read, active: true });
 *
 * // Delete
 * await client.deleteResource("Patient", patient.id!);
 * ```
 */
export class MedXAIClient {
  private baseUrl: string;
  private accessToken?: string;
  private refreshToken?: string;
  private accessTokenExpires?: number;
  private basicAuth?: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly maxRetryTime: number;
  private readonly refreshGracePeriod: number;
  private readonly onUnauthenticated?: () => void;

  // LRU cache
  private readonly cache: LRUCache<CacheEntry>;
  private readonly cacheTime: number;

  // Auto-batch queue
  private batchQueue: BatchQueueEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private autoBatchEnabled = false;
  private autoBatchDelay = 50; // ms

  constructor(config: MedXAIClientConfig) {
    // Strip trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.accessToken = config.accessToken;
    this.fetchFn = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = config.maxRetries ?? 2;
    this.maxRetryTime = config.maxRetryTime ?? 2000;
    this.refreshGracePeriod = config.refreshGracePeriod ?? 300_000;
    this.onUnauthenticated = config.onUnauthenticated;
    this.cache = new LRUCache<CacheEntry>(config.cacheSize ?? 1000);
    this.cacheTime = config.cacheTime ?? (typeof window !== "undefined" ? 60_000 : 0);
  }

  // ===========================================================================
  // Auth helpers
  // ===========================================================================

  /**
   * Set the access token for authenticated requests.
   */
  setAccessToken(token: string | undefined, refreshToken?: string): void {
    this.accessToken = token;
    if (refreshToken !== undefined) {
      this.refreshToken = refreshToken;
    }
  }

  /**
   * Set Basic Auth credentials (for client_credentials pre-exchange).
   */
  setBasicAuth(clientId: string, clientSecret: string): void {
    this.basicAuth = btoa(`${clientId}:${clientSecret}`);
  }

  /**
   * Get the current access token.
   */
  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  /**
   * Get the current refresh token.
   */
  getRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  // ===========================================================================
  // Auth — Sign In / Sign Out / Refresh
  // ===========================================================================

  /**
   * Sign in with email and password.
   *
   * This is a convenience method that calls `POST /auth/login` to get
   * an authorization code, then exchanges it via `POST /oauth2/token`
   * for access and refresh tokens. The access token is automatically
   * set on this client instance.
   *
   * @param email - The user's email.
   * @param password - The user's password.
   * @param scope - OAuth2 scope (default: "openid offline").
   * @returns Sign-in result with tokens and profile info.
   */
  async signIn(
    email: string,
    password: string,
    scope: string = "openid offline",
  ): Promise<SignInResult> {
    // Step 1: Login to get authorization code
    const loginResult = await this.startLogin(email, password, scope);

    // Step 2: Exchange code for tokens
    const tokenResult = await this.exchangeCode(loginResult.code);

    // Step 3: Set tokens on this client
    this.setTokensFromResponse(tokenResult);

    return {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token,
      expiresIn: tokenResult.expires_in,
      project: tokenResult.project,
      profile: tokenResult.profile,
    };
  }

  /**
   * Sign in with client credentials (M2M / service accounts).
   *
   * @param clientId - The OAuth2 client ID.
   * @param clientSecret - The OAuth2 client secret.
   * @returns Sign-in result with tokens.
   */
  async startClientLogin(
    clientId: string,
    clientSecret: string,
  ): Promise<SignInResult> {
    const url = `${this.baseUrl}/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString();

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });

    const tokenResult = await this.handleJsonResponse<TokenResponse>(response);
    this.setTokensFromResponse(tokenResult);

    return {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token,
      expiresIn: tokenResult.expires_in,
      project: tokenResult.project,
      profile: tokenResult.profile,
    };
  }

  /**
   * Sign out — clear tokens and auth state from this client.
   *
   * Note: This only clears local state. The server-side Login resource
   * remains valid until it expires or is explicitly revoked.
   */
  signOut(): void {
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.accessTokenExpires = undefined;
    this.basicAuth = undefined;
    this.cache.clear();
  }

  /**
   * Refresh the access token using the stored refresh token.
   *
   * @returns Updated sign-in result with new tokens.
   * @throws FhirClientError if no refresh token is available.
   */
  async refreshAccessToken(): Promise<SignInResult> {
    if (!this.refreshToken) {
      throw new FhirClientError(400, "No refresh token available — sign in first");
    }

    const url = `${this.baseUrl}/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
    }).toString();

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });

    const tokenResult = await this.handleJsonResponse<TokenResponse>(response);
    this.setTokensFromResponse(tokenResult);

    return {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token,
      expiresIn: tokenResult.expires_in,
      project: tokenResult.project,
      profile: tokenResult.profile,
    };
  }

  /**
   * Low-level: POST /auth/login to get an authorization code.
   */
  async startLogin(
    email: string,
    password: string,
    scope?: string,
  ): Promise<LoginResponse> {
    const url = `${this.baseUrl}/auth/login`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email, password, scope }),
    });
    return this.handleJsonResponse<LoginResponse>(response);
  }

  /**
   * Low-level: POST /oauth2/token with authorization_code grant.
   */
  async exchangeCode(code: string): Promise<TokenResponse> {
    const url = `${this.baseUrl}/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
    }).toString();

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
    return this.handleJsonResponse<TokenResponse>(response);
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Create a new resource.
   *
   * @param resource - The resource to create (must have `resourceType`).
   * @returns The created resource with `id` and `meta` populated by the server.
   */
  async createResource<T extends FhirResource>(resource: T): Promise<T> {
    const url = `${this.baseUrl}/${resource.resourceType}`;
    const result = await this.request<T>("POST", url, {
      body: JSON.stringify(resource),
    });
    // Invalidate search cache for this resource type
    this.invalidateSearches(resource.resourceType);
    return result;
  }

  /**
   * Create a resource only if no matching resource exists.
   *
   * @param resource - The resource to create.
   * @param query - Search criteria (sent as `If-None-Exist` header).
   * @returns The created or existing resource.
   */
  async createResourceIfNoneExist<T extends FhirResource>(
    resource: T,
    query: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resource.resourceType}`;
    const result = await this.request<T>("POST", url, {
      body: JSON.stringify(resource),
      extraHeaders: { "if-none-exist": query },
    });
    this.invalidateSearches(resource.resourceType);
    return result;
  }

  /**
   * Read a resource by type and ID.
   *
   * @param resourceType - The FHIR resource type (e.g., "Patient").
   * @param id - The resource ID.
   * @returns The resource.
   * @throws FhirClientError if not found (404) or gone (410).
   */
  async readResource<T extends FhirResource>(
    resourceType: string,
    id: string,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    return this.cachedGet<T>(url, options);
  }

  /**
   * Read a resource by reference string (e.g., "Patient/123").
   */
  async readReference<T extends FhirResource>(reference: string): Promise<T> {
    const url = `${this.baseUrl}/${reference}`;
    return this.cachedGet<T>(url);
  }

  /**
   * Update an existing resource.
   *
   * @param resource - The resource to update (must have `resourceType` and `id`).
   * @returns The updated resource with new `meta.versionId`.
   */
  async updateResource<T extends FhirResource>(resource: T): Promise<T> {
    if (!resource.id) {
      throw new FhirClientError(400, "Resource must have an id for update");
    }
    const url = `${this.baseUrl}/${resource.resourceType}/${resource.id}`;
    const result = await this.request<T>("PUT", url, {
      body: JSON.stringify(resource),
    });
    // Update cache with new version
    this.cacheResource(result);
    this.invalidateSearches(resource.resourceType);
    return result;
  }

  /**
   * Conditional update (upsert): update if exists, create if not.
   *
   * @param resource - The resource to create or update.
   * @param query - Search criteria for the conditional match.
   * @returns The created or updated resource.
   */
  async upsertResource<T extends FhirResource>(
    resource: T,
    query: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resource.resourceType}?${query}`;
    const result = await this.request<T>("PUT", url, {
      body: JSON.stringify(resource),
    });
    this.cacheResource(result);
    this.invalidateSearches(resource.resourceType);
    return result;
  }

  /**
   * Apply a JSON Patch (RFC 6902) to a resource.
   *
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param operations - Array of JSON Patch operations.
   * @returns The patched resource.
   */
  async patchResource<T extends FhirResource>(
    resourceType: string,
    id: string,
    operations: PatchOperation[],
  ): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const result = await this.request<T>("PATCH", url, {
      body: JSON.stringify(operations),
      extraHeaders: { "content-type": "application/json-patch+json" },
    });
    this.cacheResource(result);
    this.invalidateSearches(resourceType);
    return result;
  }

  /**
   * Delete a resource by type and ID.
   *
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @returns The OperationOutcome from the server.
   */
  async deleteResource(
    resourceType: string,
    id: string,
  ): Promise<OperationOutcome> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const result = await this.request<OperationOutcome>("DELETE", url);
    this.cache.delete(`${this.baseUrl}/${resourceType}/${id}`);
    this.invalidateSearches(resourceType);
    return result;
  }

  /**
   * Validate a resource against its profile.
   *
   * @param resource - The resource to validate.
   * @returns OperationOutcome with validation results.
   */
  async validateResource<T extends FhirResource>(
    resource: T,
  ): Promise<OperationOutcome> {
    const url = `${this.baseUrl}/${resource.resourceType}/$validate`;
    return this.request<OperationOutcome>("POST", url, {
      body: JSON.stringify(resource),
    });
  }

  // ===========================================================================
  // Search
  // ===========================================================================

  /**
   * Search for resources (returns Bundle).
   *
   * @param resourceType - The FHIR resource type to search.
   * @param params - Search parameters as key-value pairs.
   * @returns A Bundle containing matching resources.
   */
  async search<T extends FhirResource>(
    resourceType: string,
    params?: Record<string, string>,
  ): Promise<Bundle<T>> {
    const url = new URL(`${this.baseUrl}/${resourceType}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return this.cachedGet<Bundle<T>>(url.toString());
  }

  /**
   * Search and return a single resource (automatically sets `_count=1`).
   *
   * @param resourceType - The FHIR resource type.
   * @param params - Search parameters.
   * @returns The first matching resource, or undefined if none found.
   */
  async searchOne<T extends FhirResource>(
    resourceType: string,
    params?: Record<string, string>,
  ): Promise<T | undefined> {
    const bundle = await this.search<T>(resourceType, {
      ...params,
      _count: "1",
    });
    return bundle.entry?.[0]?.resource;
  }

  /**
   * Search and return an array of resources (extracts from Bundle).
   *
   * The returned array has a `bundle` property with the original Bundle.
   *
   * @param resourceType - The FHIR resource type.
   * @param params - Search parameters.
   * @returns A ResourceArray containing matching resources.
   */
  async searchResources<T extends FhirResource>(
    resourceType: string,
    params?: Record<string, string>,
  ): Promise<ResourceArray<T>> {
    const bundle = await this.search<T>(resourceType, params);
    return bundleToResourceArray(bundle);
  }

  /**
   * Paginated search using an async generator.
   * Yields one page of resources at a time.
   *
   * @param resourceType - The FHIR resource type.
   * @param params - Search parameters.
   */
  async *searchResourcePages<T extends FhirResource>(
    resourceType: string,
    params?: Record<string, string>,
  ): AsyncGenerator<ResourceArray<T>> {
    let bundle = await this.search<T>(resourceType, params);
    yield bundleToResourceArray(bundle);

    let nextUrl = bundle.link?.find((l) => l.relation === "next")?.url;
    while (nextUrl) {
      bundle = await this.cachedGet<Bundle<T>>(nextUrl);
      yield bundleToResourceArray(bundle);
      nextUrl = bundle.link?.find((l) => l.relation === "next")?.url;
    }
  }

  /**
   * Search using POST (for long query strings).
   *
   * @param resourceType - The FHIR resource type to search.
   * @param params - Search parameters as key-value pairs.
   * @returns A Bundle containing matching resources.
   */
  async searchPost<T extends FhirResource>(
    resourceType: string,
    params: Record<string, string>,
  ): Promise<Bundle<T>> {
    const url = `${this.baseUrl}/${resourceType}/_search`;
    const body = new URLSearchParams(params).toString();
    return this.request<Bundle<T>>("POST", url, {
      body,
      extraHeaders: { "content-type": "application/x-www-form-urlencoded" },
    });
  }

  // ===========================================================================
  // Batch / Transaction
  // ===========================================================================

  /**
   * Execute a FHIR Batch or Transaction Bundle.
   *
   * @param bundle - A Bundle with type 'batch' or 'transaction'.
   * @returns The response Bundle.
   */
  async executeBatch(bundle: Bundle): Promise<Bundle> {
    const url = this.baseUrl;
    return this.request<Bundle>("POST", url, {
      body: JSON.stringify(bundle),
    });
  }

  // ===========================================================================
  // History
  // ===========================================================================

  /**
   * Read the history of a specific resource.
   *
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @returns A history Bundle.
   */
  async readHistory<T extends FhirResource>(
    resourceType: string,
    id: string,
  ): Promise<Bundle<T>> {
    const url = `${this.baseUrl}/${resourceType}/${id}/_history`;
    return this.cachedGet<Bundle<T>>(url);
  }

  /**
   * Read a specific version of a resource.
   *
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param versionId - The version ID.
   * @returns The resource at that version.
   */
  async readVersion<T extends FhirResource>(
    resourceType: string,
    id: string,
    versionId: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}/_history/${versionId}`;
    return this.cachedGet<T>(url);
  }

  // ===========================================================================
  // Operations
  // ===========================================================================

  /**
   * Patient $everything — returns all resources in the patient compartment.
   */
  async readPatientEverything(id: string): Promise<Bundle> {
    const url = `${this.baseUrl}/Patient/${id}/$everything`;
    return this.cachedGet<Bundle>(url);
  }

  // ===========================================================================
  // Terminology Operations
  // ===========================================================================

  /**
   * Expand a ValueSet into a flat list of codes.
   *
   * @param params - Expansion parameters.
   * @param params.url - Canonical URL of the ValueSet.
   * @param params.id - Resource ID of the ValueSet (alternative to url).
   * @param params.filter - Text filter to apply to codes/display.
   * @param params.count - Maximum number of codes to return.
   * @param params.offset - Offset for paging.
   * @param params.displayLanguage - Preferred language for display values.
   * @returns An expanded ValueSet resource.
   */
  async expandValueSet(params: {
    url?: string;
    id?: string;
    filter?: string;
    count?: number;
    offset?: number;
    displayLanguage?: string;
  }): Promise<FhirResource> {
    if (params.id) {
      const qs = new URLSearchParams();
      if (params.filter) qs.set("filter", params.filter);
      if (params.count !== undefined) qs.set("count", String(params.count));
      if (params.offset !== undefined) qs.set("offset", String(params.offset));
      if (params.displayLanguage) qs.set("displayLanguage", params.displayLanguage);
      const query = qs.toString();
      const url = `${this.baseUrl}/ValueSet/${params.id}/$expand${query ? `?${query}` : ""}`;
      return this.cachedGet<FhirResource>(url);
    }

    // POST with Parameters body
    const parameter: Array<{ name: string; valueUri?: string; valueString?: string; valueInteger?: number }> = [];
    if (params.url) parameter.push({ name: "url", valueUri: params.url });
    if (params.filter) parameter.push({ name: "filter", valueString: params.filter });
    if (params.count !== undefined) parameter.push({ name: "count", valueInteger: params.count });
    if (params.offset !== undefined) parameter.push({ name: "offset", valueInteger: params.offset });
    if (params.displayLanguage) parameter.push({ name: "displayLanguage", valueString: params.displayLanguage });

    const url = `${this.baseUrl}/ValueSet/$expand`;
    return this.request<FhirResource>("POST", url, {
      body: JSON.stringify({ resourceType: "Parameters", parameter }),
    });
  }

  /**
   * Lookup a code in a CodeSystem.
   *
   * @param params - Lookup parameters.
   * @param params.system - CodeSystem URL.
   * @param params.code - Code to look up.
   * @param params.id - CodeSystem resource ID (alternative to system).
   * @returns A Parameters resource with lookup results.
   */
  async lookupCode(params: {
    system?: string;
    code: string;
    id?: string;
  }): Promise<FhirResource> {
    if (params.id) {
      const qs = new URLSearchParams({ code: params.code });
      const url = `${this.baseUrl}/CodeSystem/${params.id}/$lookup?${qs.toString()}`;
      return this.cachedGet<FhirResource>(url);
    }

    const url = `${this.baseUrl}/CodeSystem/$lookup`;
    const parameter: Array<{ name: string; valueUri?: string; valueCode?: string }> = [];
    if (params.system) parameter.push({ name: "system", valueUri: params.system });
    parameter.push({ name: "code", valueCode: params.code });

    return this.request<FhirResource>("POST", url, {
      body: JSON.stringify({ resourceType: "Parameters", parameter }),
    });
  }

  /**
   * Validate a code against a CodeSystem or ValueSet.
   *
   * @param params - Validation parameters.
   * @param params.url - CodeSystem or ValueSet canonical URL.
   * @param params.system - CodeSystem URL (for CodeSystem validation).
   * @param params.code - The code to validate.
   * @param params.id - Resource ID (alternative to url/system).
   * @param params.resourceType - "CodeSystem" or "ValueSet" (default: "CodeSystem").
   * @returns A Parameters resource with validation result.
   */
  async validateCode(params: {
    url?: string;
    system?: string;
    code: string;
    id?: string;
    resourceType?: "CodeSystem" | "ValueSet";
  }): Promise<FhirResource> {
    const rt = params.resourceType ?? "CodeSystem";

    if (params.id) {
      const qs = new URLSearchParams({ code: params.code });
      if (params.system) qs.set("system", params.system);
      const url = `${this.baseUrl}/${rt}/${params.id}/$validate-code?${qs.toString()}`;
      return this.cachedGet<FhirResource>(url);
    }

    const url = `${this.baseUrl}/${rt}/$validate-code`;
    const parameter: Array<{ name: string; valueUri?: string; valueCode?: string }> = [];
    if (params.url) parameter.push({ name: "url", valueUri: params.url });
    if (params.system) parameter.push({ name: "system", valueUri: params.system });
    parameter.push({ name: "code", valueCode: params.code });

    return this.request<FhirResource>("POST", url, {
      body: JSON.stringify({ resourceType: "Parameters", parameter }),
    });
  }

  // ===========================================================================
  // Conformance Resource Helpers
  // ===========================================================================

  /**
   * Get a StructureDefinition by resource type name.
   *
   * @param type - The FHIR resource type (e.g., "Patient").
   * @returns The StructureDefinition resource, or undefined if not found.
   */
  async getStructureDefinition(type: string): Promise<FhirResource | undefined> {
    return this.searchOne<FhirResource>("StructureDefinition", { type });
  }

  /**
   * Get a StructureDefinition by canonical URL.
   *
   * @param url - The canonical URL of the StructureDefinition.
   * @returns The StructureDefinition resource, or undefined if not found.
   */
  async getStructureDefinitionByUrl(url: string): Promise<FhirResource | undefined> {
    return this.searchOne<FhirResource>("StructureDefinition", { url });
  }

  /**
   * Get a ValueSet by canonical URL.
   *
   * @param url - The canonical URL of the ValueSet.
   * @returns The ValueSet resource, or undefined if not found.
   */
  async getValueSet(url: string): Promise<FhirResource | undefined> {
    return this.searchOne<FhirResource>("ValueSet", { url });
  }

  /**
   * Get a CodeSystem by canonical URL.
   *
   * @param url - The canonical URL of the CodeSystem.
   * @returns The CodeSystem resource, or undefined if not found.
   */
  async getCodeSystem(url: string): Promise<FhirResource | undefined> {
    return this.searchOne<FhirResource>("CodeSystem", { url });
  }

  // ===========================================================================
  // Metadata
  // ===========================================================================

  /**
   * Read the server's CapabilityStatement.
   */
  async readMetadata(): Promise<FhirResource> {
    const url = `${this.baseUrl}/metadata`;
    return this.cachedGet<FhirResource>(url);
  }

  // ===========================================================================
  // J1: Auto-Batch
  // ===========================================================================

  /**
   * Enable or disable auto-batching.
   *
   * When enabled, individual CRUD operations are queued and flushed
   * as a single batch Bundle after a configurable delay.
   *
   * @param enabled - Whether to enable auto-batching.
   * @param delay - Delay in ms before flushing the queue (default: 50).
   */
  setAutoBatch(enabled: boolean, delay?: number): void {
    this.autoBatchEnabled = enabled;
    if (delay !== undefined) this.autoBatchDelay = delay;
    if (!enabled && this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
      // Flush remaining
      if (this.batchQueue.length > 0) {
        void this.flushBatch();
      }
    }
  }

  /**
   * Manually flush the auto-batch queue.
   * Returns when all queued operations have completed.
   */
  async flushBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const entries = this.batchQueue.splice(0);
    if (entries.length === 0) return;

    const bundle: Bundle = {
      resourceType: "Bundle",
      type: "batch",
      entry: entries.map((e) => ({
        resource: e.resource,
        request: { method: e.method, url: e.url },
      })),
    };

    try {
      const response = await this.executeBatch(bundle);
      const responseEntries = response.entry ?? [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const respEntry = responseEntries[i];

        if (!respEntry) {
          entry.reject(new FhirClientError(500, "No response entry for batch item"));
          continue;
        }

        const status = parseInt(respEntry.response?.status ?? "500", 10);
        if (status >= 200 && status < 300) {
          entry.resolve(respEntry.resource ?? { resourceType: "OperationOutcome", issue: [] } as OperationOutcome);
        } else {
          entry.reject(
            new FhirClientError(
              status,
              `Batch entry failed with status ${respEntry.response?.status}`,
            ),
          );
        }
      }
    } catch (err) {
      // Reject all pending entries
      for (const entry of entries) {
        entry.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Queue a request for auto-batching.
   * Returns a Promise that resolves when the batch is flushed.
   * @internal
   */
  pushToBatch<T extends FhirResource>(
    method: string,
    url: string,
    resource?: FhirResource,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.batchQueue.push({
        method,
        url,
        resource,
        resolve: resolve as (value: FhirResource | OperationOutcome) => void,
        reject,
      });

      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.batchTimer = null;
          void this.flushBatch();
        }, this.autoBatchDelay);
      }
    });
  }

  /**
   * Check if auto-batch is enabled.
   */
  isAutoBatchEnabled(): boolean {
    return this.autoBatchEnabled;
  }

  // ===========================================================================
  // J2: Binary / Attachment Support
  // ===========================================================================

  /**
   * Upload a binary attachment.
   *
   * @param data - The binary data as a string, Blob, or ArrayBuffer.
   * @param contentType - The MIME type of the data.
   * @param securityContext - Optional resource reference for security context.
   * @returns The created Binary resource.
   */
  async uploadBinary(
    data: string | Blob | ArrayBuffer,
    contentType: string,
    securityContext?: string,
  ): Promise<FhirResource> {
    await this.refreshIfExpired();
    const headers = this.buildHeaders();
    headers["content-type"] = contentType;
    if (securityContext) {
      headers["x-security-context"] = securityContext;
    }

    const url = `${this.baseUrl}/Binary`;
    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers,
      body: data as BodyInit,
    });

    return this.handleResponse<FhirResource>(response);
  }

  /**
   * Download a binary attachment.
   *
   * @param id - The Binary resource ID.
   * @returns The binary data as a Blob.
   */
  async downloadBinary(id: string): Promise<Blob> {
    await this.refreshIfExpired();
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers["authorization"] = `Bearer ${this.accessToken}`;
    }

    const url = `${this.baseUrl}/Binary/${id}`;
    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new FhirClientError(
        response.status,
        `Failed to download Binary/${id}: ${response.statusText}`,
      );
    }

    return response.blob();
  }

  /**
   * Create a Binary resource with base64-encoded data.
   *
   * @param contentType - MIME type.
   * @param data - Base64-encoded data.
   * @returns The created Binary resource.
   */
  async createBinary(
    contentType: string,
    data: string,
  ): Promise<FhirResource> {
    return this.createResource({
      resourceType: "Binary",
      contentType,
      data,
    });
  }

  // ===========================================================================
  // J3: PKCE Login Flow
  // ===========================================================================

  /**
   * Generate a PKCE code verifier and challenge for OAuth2 authorization.
   *
   * @returns Object with `codeVerifier` and `codeChallenge`.
   */
  static async generatePkceChallenge(): Promise<{
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

  /**
   * Build the authorization URL for a PKCE login flow.
   *
   * @param options - PKCE authorization options.
   * @returns The full authorization URL to redirect the user to.
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
   * Exchange an authorization code with PKCE code verifier.
   *
   * @param code - The authorization code from the callback.
   * @param codeVerifier - The PKCE code verifier.
   * @param redirectUri - The redirect URI used in the authorization request.
   * @returns Sign-in result with tokens.
   */
  async exchangeCodeWithPkce(
    code: string,
    codeVerifier: string,
    redirectUri?: string,
  ): Promise<SignInResult> {
    const url = `${this.baseUrl}/oauth2/token`;
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    };
    if (redirectUri) {
      params.redirect_uri = redirectUri;
    }

    const body = new URLSearchParams(params).toString();
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });

    const tokenResult = await this.handleJsonResponse<TokenResponse>(response);
    this.setTokensFromResponse(tokenResult);

    return {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token,
      expiresIn: tokenResult.expires_in,
      project: tokenResult.project,
      profile: tokenResult.profile,
    };
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Get a cached resource synchronously (no network request).
   * Returns undefined if not in cache.
   */
  getCached<T extends FhirResource>(
    resourceType: string,
    id: string,
  ): T | undefined {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const entry = this.cache.get(url);
    if (!entry) return undefined;
    if (this.cacheTime > 0 && Date.now() - entry.time > this.cacheTime) {
      this.cache.delete(url);
      return undefined;
    }
    return entry.value as T;
  }

  /**
   * Invalidate all cached data.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  // ===========================================================================
  // Internal — Request Pipeline
  // ===========================================================================

  private async request<T>(
    method: string,
    url: string,
    options?: {
      body?: string;
      extraHeaders?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    // Auto-refresh token if expired
    await this.refreshIfExpired();

    const headers = this.buildHeaders();
    if (options?.extraHeaders) {
      Object.assign(headers, options.extraHeaders);
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      body: options?.body,
      signal: options?.signal,
    };

    const response = await this.fetchWithRetry(url, fetchOptions);

    // Handle 401 — attempt token refresh and retry once
    if (response.status === 401) {
      const retried = await this.handleUnauthenticated(method, url, fetchOptions);
      if (retried) return retried as T;
    }

    return this.handleResponse<T>(response);
  }

  private async cachedGet<T>(url: string, options?: RequestOptions): Promise<T> {
    // Check cache
    if (this.cacheTime > 0 && options?.cache !== "no-cache" && options?.cache !== "reload") {
      const entry = this.cache.get(url);
      if (entry && Date.now() - entry.time <= this.cacheTime) {
        return entry.value as T;
      }
    }

    const result = await this.request<T>("GET", url, { signal: options?.signal });

    // Cache the result
    if (this.cacheTime > 0) {
      this.cache.set(url, { value: result, time: Date.now() });
    }

    return result;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const response = await this.fetchFn(url, options);

      if (!isRetryable(response.status) || attempt === this.maxRetries) {
        return response;
      }

      // Exponential backoff: 500 * 1.5^attempt
      const delay = Math.min(500 * Math.pow(1.5, attempt), this.maxRetryTime);
      await sleep(delay);
    }

    // Unreachable but TypeScript needs it
    return this.fetchFn(url, options);
  }

  private async refreshIfExpired(): Promise<void> {
    if (!this.accessTokenExpires || !this.refreshToken) return;
    if (Date.now() < this.accessTokenExpires - this.refreshGracePeriod) return;

    try {
      await this.refreshAccessToken();
    } catch {
      // Token refresh failed — continue with current token
    }
  }

  private async handleUnauthenticated<T>(
    method: string,
    url: string,
    fetchOptions: RequestInit,
  ): Promise<T | undefined> {
    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        // Retry with new token
        const headers = this.buildHeaders();
        Object.assign(headers, (fetchOptions.headers as Record<string, string>) ?? {});
        const retryResponse = await this.fetchFn(url, {
          ...fetchOptions,
          headers,
        });
        if (retryResponse.ok) {
          return (await this.handleResponse<T>(retryResponse));
        }
      } catch {
        // Refresh failed
      }
    }

    // Permanent auth failure
    this.signOut();
    this.onUnauthenticated?.();
    return undefined;
  }

  private setTokensFromResponse(tokenResult: TokenResponse): void {
    this.accessToken = tokenResult.access_token;
    this.refreshToken = tokenResult.refresh_token;
    if (tokenResult.expires_in) {
      this.accessTokenExpires = Date.now() + tokenResult.expires_in * 1000;
    }
  }

  private cacheResource(resource: FhirResource): void {
    if (!resource.id || this.cacheTime === 0) return;
    const url = `${this.baseUrl}/${resource.resourceType}/${resource.id}`;
    this.cache.set(url, { value: resource, time: Date.now() });
  }

  private invalidateSearches(resourceType: string): void {
    // Remove all cache entries that look like search URLs for this type
    const prefix = `${this.baseUrl}/${resourceType}`;
    for (const key of this.cache.keys()) {
      // Invalidate search URLs (contain '?' or are the type URL without an ID)
      if (key.startsWith(prefix) && (key.includes("?") || key === prefix)) {
        this.cache.delete(key);
      }
      // Invalidate history URLs
      if (key.includes("_history") && key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": FHIR_JSON,
      accept: FHIR_JSON,
    };
    if (this.accessToken) {
      headers["authorization"] = `Bearer ${this.accessToken}`;
    } else if (this.basicAuth) {
      headers["authorization"] = `Basic ${this.basicAuth}`;
    }
    return headers;
  }

  private async handleJsonResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown;

    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      throw new FhirClientError(
        response.status,
        `Invalid JSON response: ${text.slice(0, 200)}`,
      );
    }

    if (!response.ok) {
      // Auth endpoints return { error, error_description } or OperationOutcome
      const obj = body as Record<string, unknown> | undefined;
      const message = (obj?.error_description as string)
        ?? (obj?.diagnostics as string)
        ?? (isOperationOutcome(body) ? body.issue?.[0]?.diagnostics : undefined)
        ?? `HTTP ${response.status} ${response.statusText}`;
      const outcome = isOperationOutcome(body) ? body : undefined;
      throw new FhirClientError(response.status, message, outcome);
    }

    return body as T;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown;

    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      throw new FhirClientError(
        response.status,
        `Invalid JSON response: ${text.slice(0, 200)}`,
      );
    }

    if (!response.ok) {
      const outcome = isOperationOutcome(body) ? body : undefined;
      const message = outcome?.issue?.[0]?.diagnostics
        ?? outcome?.issue?.[0]?.details?.text
        ?? `HTTP ${response.status} ${response.statusText}`;
      throw new FhirClientError(response.status, message, outcome);
    }

    return body as T;
  }
}

// =============================================================================
// Section 3: Helpers
// =============================================================================

function isOperationOutcome(value: unknown): value is OperationOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).resourceType === "OperationOutcome"
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bundleToResourceArray<T extends FhirResource>(
  bundle: Bundle<T>,
): ResourceArray<T> {
  const resources = (bundle.entry?.map((e) => e.resource).filter(Boolean) as T[]) ?? [];
  const arr = resources as ResourceArray<T>;
  arr.bundle = bundle;
  return arr;
}

// =============================================================================
// Section 4: LRU Cache
// =============================================================================

interface CacheEntry {
  value: unknown;
  time: number;
}

/**
 * Simple LRU cache using Map insertion order.
 */
class LRUCache<T> {
  private readonly max: number;
  private readonly map = new Map<string, T>();

  constructor(max: number) {
    this.max = max;
  }

  get(key: string): T | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max && this.max > 0) {
      // Evict oldest (first key)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }
}
