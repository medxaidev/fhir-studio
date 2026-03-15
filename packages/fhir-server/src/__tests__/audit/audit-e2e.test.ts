/**
 * AuditEvent E2E Tests
 *
 * Verifies that AuditEvent resources are automatically created
 * after successful create, update, and delete operations.
 *
 * @module fhir-server/__tests__
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { FastifyInstance } from "fastify";
import { createApp } from "../../app.js";
import {
  DatabaseClient,
  FhirRepository,
  SearchParameterRegistry,
} from "@medxai/fhir-persistence";
import type { SearchParameterBundle } from "@medxai/fhir-persistence";
import { readFileSync, existsSync } from "fs";

// =============================================================================
// Section 1: Setup
// =============================================================================

const FHIR_JSON = "application/fhir+json";

let db: DatabaseClient;
let app: FastifyInstance;

beforeAll(async () => {
  db = new DatabaseClient({
    host: process.env["DB_HOST"] ?? "localhost",
    port: Number(process.env["DB_PORT"] ?? 5433),
    database: process.env["DB_NAME"] ?? "medxai_dev",
    user: process.env["DB_USER"] ?? "postgres",
    password: process.env["DB_PASSWORD"] ?? "assert",
  });

  const alive = await db.ping();
  if (!alive) {
    throw new Error("Cannot connect to PostgreSQL. Run `npm run db:init` first.");
  }

  // Load SearchParameterRegistry
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const specDir = resolve(scriptDir, "..", "..", "..", "..", "..", "spec", "fhir", "r4");
  const platformDir = resolve(scriptDir, "..", "..", "..", "..", "..", "spec", "platform");
  const spBundlePath = resolve(specDir, "search-parameters.json");

  const spBundle = JSON.parse(readFileSync(spBundlePath, "utf8")) as SearchParameterBundle;
  const spRegistry = new SearchParameterRegistry();
  spRegistry.indexBundle(spBundle);

  const platformSpPath = resolve(platformDir, "search-parameters-medxai.json");
  if (existsSync(platformSpPath)) {
    spRegistry.indexBundle(JSON.parse(readFileSync(platformSpPath, "utf8")) as SearchParameterBundle);
  }

  const repo = new FhirRepository(db, spRegistry);

  // Create app (no validation needed for audit tests)
  app = await createApp({
    repo,
    searchRegistry: spRegistry,
  });
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

// =============================================================================
// Helper: poll for audit event with retry
// =============================================================================

/**
 * Poll for an AuditEvent matching the given action code for a target resource.
 * Retries up to `maxAttempts` with `intervalMs` between attempts.
 */
async function waitForAuditEvent(
  resourceRef: string,
  actionCode: string,
  maxAttempts = 20,
  intervalMs = 150,
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await app.inject({
      method: "GET",
      url: `/AuditEvent?entity=${resourceRef}`,
    });
    if (res.statusCode === 200) {
      const bundle = JSON.parse(res.body);
      if (bundle.entry?.length > 0) {
        const match = bundle.entry.find((e: any) => e.resource?.action === actionCode);
        if (match) return match.resource;
      }
    }
  }
  return undefined;
}

// =============================================================================
// Section 2: AuditEvent Creation Tests
// =============================================================================

describe("AuditEvent E2E — Create", () => {
  it("POST Patient creates an AuditEvent with action=C", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": FHIR_JSON },
      payload: JSON.stringify({
        resourceType: "Patient",
        name: [{ family: "AuditTest", given: ["Create"] }],
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const patient = JSON.parse(createRes.body);

    const audit = await waitForAuditEvent(`Patient/${patient.id}`, "C");
    expect(audit).toBeDefined();
    expect(audit.resourceType).toBe("AuditEvent");
    expect(audit.entity[0].what.reference).toBe(`Patient/${patient.id}`);
  });
});

describe("AuditEvent E2E — Update", () => {
  it("PUT Patient creates an AuditEvent with action=U", async () => {
    // Create a Patient first
    const createRes = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": FHIR_JSON },
      payload: JSON.stringify({
        resourceType: "Patient",
        name: [{ family: "AuditTest", given: ["Update"] }],
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const patient = JSON.parse(createRes.body);

    // Update the Patient
    const updateRes = await app.inject({
      method: "PUT",
      url: `/Patient/${patient.id}`,
      headers: { "content-type": FHIR_JSON },
      payload: JSON.stringify({
        resourceType: "Patient",
        id: patient.id,
        name: [{ family: "AuditTestUpdated", given: ["Update"] }],
      }),
    });
    expect(updateRes.statusCode).toBe(200);

    // Poll for update audit event
    const audit = await waitForAuditEvent(`Patient/${patient.id}`, "U");
    expect(audit).toBeDefined();
    expect(audit.entity[0].what.reference).toBe(`Patient/${patient.id}`);
  });
});

describe("AuditEvent E2E — Delete", () => {
  it("DELETE Patient creates an AuditEvent with action=D", async () => {
    // Create a Patient first
    const createRes = await app.inject({
      method: "POST",
      url: "/Patient",
      headers: { "content-type": FHIR_JSON },
      payload: JSON.stringify({
        resourceType: "Patient",
        name: [{ family: "AuditTest", given: ["Delete"] }],
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const patient = JSON.parse(createRes.body);

    // Delete the Patient
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/Patient/${patient.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);

    // Poll for delete audit event
    const audit = await waitForAuditEvent(`Patient/${patient.id}`, "D");
    expect(audit).toBeDefined();
    expect(audit.entity[0].what.reference).toBe(`Patient/${patient.id}`);
  });
});

describe("AuditEvent E2E — Structure", () => {
  it("AuditEvent has correct FHIR R4 structure", async () => {
    // Create a resource to trigger audit
    const createRes = await app.inject({
      method: "POST",
      url: "/Observation",
      headers: { "content-type": FHIR_JSON },
      payload: JSON.stringify({
        resourceType: "Observation",
        status: "final",
        code: { text: "AuditStructureTest" },
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const obs = JSON.parse(createRes.body);

    // Poll for create audit event
    const audit = await waitForAuditEvent(`Observation/${obs.id}`, "C");
    expect(audit).toBeDefined();
    expect(audit.resourceType).toBe("AuditEvent");
    expect(audit.type).toEqual({
      system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
      code: "rest",
      display: "RESTful Operation",
    });
    expect(audit.subtype).toHaveLength(1);
    expect(audit.subtype[0].system).toBe("http://hl7.org/fhir/restful-interaction");
    expect(audit.outcome).toBe("0");
    expect(audit.agent).toHaveLength(1);
    expect(audit.agent[0].requestor).toBe(true);
    expect(audit.source.observer.display).toBe("MedXAI FHIR Server");
    expect(audit.entity).toHaveLength(1);
    expect(audit.entity[0].what.reference).toBe(`Observation/${obs.id}`);
    expect(audit.recorded).toBeDefined();
  });
});
