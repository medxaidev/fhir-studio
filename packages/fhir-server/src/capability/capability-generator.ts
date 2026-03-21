/**
 * CapabilityStatement Generator
 *
 * Generates a FHIR R4 CapabilityStatement for the server by:
 * 1. Getting the base CS from engine.runtime.generateCapabilityStatement()
 * 2. Augmenting with fhir-server layer information (auth endpoints, etc.)
 *
 * @module fhir-server/capability
 */

import type { FhirEngine } from "../types/engine.js";
import type { CapabilityStatement } from "../types/fhir.js";
import type { AuthConfig } from "../types/config.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Options for generating the CapabilityStatement.
 */
export interface CapabilityGeneratorOptions {
  /** The FhirEngine instance. */
  engine: FhirEngine;
  /** Server base URL. */
  baseUrl: string;
  /** Auth configuration (to advertise security endpoints). */
  auth?: AuthConfig;
  /** Server software name. */
  softwareName?: string;
  /** Server software version. */
  softwareVersion?: string;
}

// =============================================================================
// Section 2: Generator
// =============================================================================

/**
 * Generate a complete CapabilityStatement for this server.
 *
 * Delegates to engine.runtime for the base statement, then augments
 * with server-layer information.
 */
export function generateCapabilityStatement(
  options: CapabilityGeneratorOptions,
): CapabilityStatement {
  const { engine, baseUrl, auth, softwareName, softwareVersion } = options;

  // Get base CS from engine runtime (if available) or build a minimal one
  let cs: CapabilityStatement;
  const rt = engine.runtime as unknown as Record<string, unknown>;
  if (typeof rt.generateCapabilityStatement === "function") {
    try {
      cs = (rt.generateCapabilityStatement as (url: string) => CapabilityStatement)(baseUrl);
    } catch {
      cs = buildMinimalCapabilityStatement(baseUrl, engine);
    }
  } else {
    cs = buildMinimalCapabilityStatement(baseUrl, engine);
  }

  // Augment with server-layer info
  augmentWithServerInfo(cs, {
    baseUrl,
    auth,
    softwareName: softwareName ?? "fhir-server",
    softwareVersion: softwareVersion ?? "0.1.0",
  });

  return cs;
}

// =============================================================================
// Section 3: Minimal CS Builder
// =============================================================================

/**
 * Build a minimal CapabilityStatement when the engine doesn't provide one.
 */
function buildMinimalCapabilityStatement(
  baseUrl: string,
  engine: FhirEngine,
): CapabilityStatement {
  const resourceTypes = engine.resourceTypes;

  // FIX-1: Build searchParam declarations from engine.definitions
  const getSearchParamsForType = (type: string): Array<{ name: string; type: string; documentation?: string }> => {
    const params: Array<{ name: string; type: string; documentation?: string }> = [];
    try {
      const defs = engine.definitions as unknown as Record<string, unknown>;
      if (typeof defs.getSearchParameters === "function") {
        const sps = (defs.getSearchParameters as (t: string) => Array<Record<string, unknown>>)(type);
        if (Array.isArray(sps)) {
          for (const sp of sps) {
            if (sp.code && sp.type) {
              params.push({
                name: sp.code as string,
                type: sp.type as string,
                ...(sp.description ? { documentation: sp.description as string } : {}),
              });
            }
          }
        }
      }
    } catch {
      // definitions.getSearchParameters may not be available
    }
    // Always include common search params if none found
    if (params.length === 0) {
      params.push(
        { name: "_id", type: "token" },
        { name: "_lastUpdated", type: "date" },
      );
    }
    return params;
  };

  const resources = resourceTypes.map((type) => ({
    type,
    interaction: [
      { code: "read" },
      { code: "create" },
      { code: "update" },
      { code: "delete" },
      { code: "search-type" },
      { code: "history-instance" },
      { code: "vread" },
    ],
    versioning: "versioned" as const,
    readHistory: true,
    updateCreate: false,
    conditionalCreate: false,
    conditionalRead: "not-supported" as const,
    conditionalUpdate: false,
    conditionalDelete: "not-supported" as const,
    searchParam: getSearchParamsForType(type),
  }));

  return {
    resourceType: "CapabilityStatement",
    status: "active",
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["json", "application/fhir+json"],
    implementation: {
      url: baseUrl,
      description: "FHIR R4 REST API Server",
    },
    rest: [
      {
        mode: "server",
        resource: resources,
      },
    ],
  } as CapabilityStatement;
}

// =============================================================================
// Section 4: Augmentation
// =============================================================================

interface AugmentOptions {
  baseUrl: string;
  auth?: AuthConfig;
  softwareName: string;
  softwareVersion: string;
}

/**
 * Augment a CapabilityStatement with server-layer information.
 */
function augmentWithServerInfo(cs: CapabilityStatement, options: AugmentOptions): void {
  const { baseUrl, auth, softwareName, softwareVersion } = options;

  // Software info
  (cs as Record<string, unknown>).software = {
    name: softwareName,
    version: softwareVersion,
  };

  // Implementation URL
  (cs as Record<string, unknown>).implementation = {
    url: baseUrl,
    description: `${softwareName} v${softwareVersion}`,
  };

  // Security info (if auth is enabled)
  if (auth?.enabled && cs.rest && cs.rest.length > 0) {
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    cs.rest[0].security = {
      cors: true,
      service: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/restful-security-service",
              code: "SMART-on-FHIR",
              display: "SMART on FHIR",
            },
          ],
        },
      ],
      description: `OAuth2 endpoints: authorize=${base}/oauth2/authorize, token=${base}/oauth2/token`,
    };
  }
}
