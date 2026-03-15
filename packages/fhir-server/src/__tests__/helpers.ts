/**
 * Test Helpers — Mock Repository & App Factory
 *
 * Provides a mock FhirRepository and a pre-configured Fastify app
 * for HTTP-level testing via inject().
 */

import { vi } from "vitest";
import type { ResourceRepository, PersistedResource, HistoryEntry, SearchParameterRegistry } from "@medxai/fhir-persistence";
import { createApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn>;

/**
 * Mock ResourceRepository with vi.fn() stubs.
 */
export type MockRepo = ResourceRepository & Record<string, MockFn>;

/**
 * Create a mock ResourceRepository with vi.fn() stubs.
 */
export function createMockRepo(): MockRepo {
  return {
    createResource: vi.fn().mockResolvedValue({}),
    readResource: vi.fn(),
    updateResource: vi.fn(),
    deleteResource: vi.fn(),
    readHistory: vi.fn(),
    readTypeHistory: vi.fn(),
    readVersion: vi.fn(),
    searchResources: vi.fn(),
  } as unknown as MockRepo;
}

/**
 * Create a test Fastify app with a mock repo.
 */
export async function createTestApp(
  repo?: ResourceRepository,
  options?: { searchRegistry?: SearchParameterRegistry; baseUrl?: string },
): Promise<FastifyInstance> {
  const mockRepo = repo ?? createMockRepo();
  return createApp({
    repo: mockRepo,
    logger: false,
    searchRegistry: options?.searchRegistry,
    baseUrl: options?.baseUrl,
  });
}

/**
 * Build a mock PersistedResource for testing.
 */
export function mockPersistedResource(
  resourceType: string,
  overrides?: Partial<PersistedResource>,
): PersistedResource {
  const id = overrides?.id ?? randomUUID();
  const versionId = overrides?.meta?.versionId ?? randomUUID();
  const lastUpdated = overrides?.meta?.lastUpdated ?? new Date().toISOString();

  return {
    resourceType,
    id,
    meta: {
      versionId,
      lastUpdated,
      ...overrides?.meta,
    },
    ...overrides,
  };
}

/**
 * Build a mock HistoryEntry for testing.
 */
export function mockHistoryEntry(
  resourceType: string,
  overrides?: Partial<HistoryEntry>,
): HistoryEntry {
  const id = overrides?.id ?? randomUUID();
  const versionId = overrides?.versionId ?? randomUUID();
  const lastUpdated = overrides?.lastUpdated ?? new Date().toISOString();
  const deleted = overrides?.deleted ?? false;

  return {
    resource: deleted
      ? null
      : mockPersistedResource(resourceType, {
        id,
        meta: { versionId, lastUpdated },
      }),
    versionId,
    lastUpdated,
    deleted,
    resourceType,
    id,
    ...overrides,
  };
}
