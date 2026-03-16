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

  // Get base CS from engine runtime
  let cs: CapabilityStatement;
  try {
    cs = engine.runtime.generateCapabilityStatement(baseUrl);
  } catch {
    // If engine doesn't have a CS generator, build a minimal one
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
  const resourceTypes = engine.definitions.getResourceTypes();

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
