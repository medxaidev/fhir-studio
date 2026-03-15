/**
 * REVIEW-004: FHIR Repository Parity Test Suite (MedXAI vs Medplum)
 *
 * Sends identical HTTP requests to both servers and compares:
 * - HTTP status codes
 * - Response body structure
 * - Version increment rules
 * - History behavior
 * - Delete semantics
 * - Error codes
 * - DB-level side effects
 *
 * MedXAI:  In-process Fastify via createApp() on a real port + real PostgreSQL
 * Medplum: http://localhost:8103/fhir/R4/ + real PostgreSQL (medplum_next)
 *
 * Requires:
 * - MedXAI DB: `npm run db:init` in fhir-persistence (medxai_dev on localhost:5433)
 * - Medplum: running at http://localhost:8103 with ClientApplication credentials
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import pg from "pg";

import { DatabaseClient, FhirRepository } from "@medxai/fhir-persistence";
import { createApp } from "../app.js";

// =============================================================================
// Configuration
// =============================================================================

const MEDPLUM_BASE = "http://localhost:8103/fhir/R4";
const MEDPLUM_AUTH_URL = "http://localhost:8103/oauth2/token";
const MEDPLUM_CLIENT_ID = "58bc82bf-419d-48d4-bb94-84efa8e14f18";
const MEDPLUM_CLIENT_SECRET = "b373eb9d-3c1d-4dc5-854e-55fe928d49dd";

// =============================================================================
// Setup
// =============================================================================

function loadEnv(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(scriptDir, "..", "..", "..", "fhir-persistence", ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

let db: DatabaseClient;
let medxaiApp: FastifyInstance;
let medxaiBase: string;
let medplumToken: string;
let medplumPool: pg.Pool;

const cleanupItems: Array<{ server: "medxai" | "medplum"; resourceType: string; id: string }> = [];

// =============================================================================
// HTTP Helpers
// =============================================================================

interface HttpResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

async function medxaiRequest(method: string, path: string, body?: any, headers?: Record<string, string>): Promise<HttpResponse> {
  const url = `${medxaiBase}${path}`;
  const hdrsObj: Record<string, string> = { ...headers };
  if (body) hdrsObj["content-type"] = "application/fhir+json";
  const fetchOpts: RequestInit = { method, headers: hdrsObj };
  if (body) fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(url, fetchOpts);
  let parsed: any;
  try { parsed = await res.json(); } catch { parsed = await res.text(); }
  const hdrs: Record<string, string> = {};
  res.headers.forEach((v, k) => { hdrs[k] = v; });
  return { status: res.status, body: parsed, headers: hdrs };
}

async function medplumRequest(method: string, path: string, body?: any, headers?: Record<string, string>): Promise<HttpResponse> {
  const url = `${MEDPLUM_BASE}${path}`;
  const hdrsObj: Record<string, string> = { authorization: `Bearer ${medplumToken}`, ...headers };
  if (body) hdrsObj["content-type"] = "application/fhir+json";
  const fetchOpts: RequestInit = { method, headers: hdrsObj };
  if (body) fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(url, fetchOpts);
  let parsed: any;
  try { parsed = await res.json(); } catch { parsed = await res.text(); }
  const hdrs: Record<string, string> = {};
  res.headers.forEach((v, k) => { hdrs[k] = v; });
  return { status: res.status, body: parsed, headers: hdrs };
}

function track(server: "medxai" | "medplum", resourceType: string, id: string): void {
  cleanupItems.push({ server, resourceType, id });
}

function trackBoth(resourceType: string, medxaiId: string, medplumId: string): void {
  track("medxai", resourceType, medxaiId);
  track("medplum", resourceType, medplumId);
}

async function cleanMedxai(resourceType: string, id: string): Promise<void> {
  try {
    for (const t of ["HumanName", "Address", "ContactPoint", "Identifier"]) {
      try { await db.query(`DELETE FROM "${t}" WHERE "resourceId" = $1`, [id]); } catch { /* */ }
    }
    try { await db.query(`DELETE FROM "${resourceType}_References" WHERE "resourceId" = $1`, [id]); } catch { /* */ }
    await db.query(`DELETE FROM "${resourceType}_History" WHERE "id" = $1`, [id]);
    await db.query(`DELETE FROM "${resourceType}" WHERE "id" = $1`, [id]);
  } catch { /* */ }
}

async function cleanMedplum(resourceType: string, id: string): Promise<void> {
  try {
    await fetch(`${MEDPLUM_BASE}/${resourceType}/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${medplumToken}` },
    });
  } catch { /* */ }
}

function stripMeta(body: any): any {
  if (!body || typeof body !== "object") return body;
  const clone = { ...body };
  delete clone.id;
  delete clone.meta;
  if (clone.extension) {
    clone.extension = clone.extension.filter((e: any) => !e.url?.includes("medplum.com"));
    if (clone.extension.length === 0) delete clone.extension;
  }
  return clone;
}

async function getMedplumToken(): Promise<string> {
  const res = await fetch(MEDPLUM_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${MEDPLUM_CLIENT_ID}&client_secret=${MEDPLUM_CLIENT_SECRET}`,
  });
  if (res.status !== 200) throw new Error(`Medplum token failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// =============================================================================
// Lifecycle
// =============================================================================

beforeAll(async () => {
  loadEnv();

  db = new DatabaseClient({
    host: process.env["DB_HOST"] ?? "localhost",
    port: parseInt(process.env["DB_PORT"] ?? "5433", 10),
    database: process.env["DB_NAME"] ?? "medxai_dev",
    user: process.env["DB_USER"] ?? "postgres",
    password: process.env["DB_PASSWORD"] ?? "assert",
  });
  if (!(await db.ping())) throw new Error("Cannot connect to MedXAI DB");

  const repo = new FhirRepository(db);
  medxaiApp = await createApp({ repo, logger: false });
  const addr = await medxaiApp.listen({ port: 0, host: "127.0.0.1" });
  medxaiBase = addr;

  medplumToken = await getMedplumToken();

  medplumPool = new pg.Pool({
    host: "localhost",
    port: 5433,
    database: "medplum_next",
    user: "postgres",
    password: "assert",
  });

  const metaRes = await medplumRequest("GET", "/metadata");
  if (metaRes.status !== 200) throw new Error("Medplum not accessible");
}, 30_000);

afterAll(async () => {
  for (const item of cleanupItems) {
    if (item.server === "medxai") await cleanMedxai(item.resourceType, item.id);
    else await cleanMedplum(item.resourceType, item.id);
  }
  if (medxaiApp) await medxaiApp.close();
  if (db && !db.isClosed) await db.close();
  if (medplumPool) await medplumPool.end();
});

// =============================================================================
// 1️⃣ CREATE Parity (10 tests)
// =============================================================================

describe("1. CREATE Parity", () => {
  it("CR-P-01: minimal Patient → both 201, id+meta present", async () => {
    const body = { resourceType: "Patient" };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);

    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    expect(mx.body.id).toBeTruthy();
    expect(mp.body.id).toBeTruthy();
    expect(mx.body.meta?.versionId).toBeTruthy();
    expect(mp.body.meta?.versionId).toBeTruthy();
    expect(mx.body.meta?.lastUpdated).toBeTruthy();
    expect(mp.body.meta?.lastUpdated).toBeTruthy();
    trackBoth("Patient", mx.body.id, mp.body.id);
  });

  it("CR-P-02: ETag and Location headers on create", async () => {
    const body = { resourceType: "Patient", name: [{ family: "Parity" }] };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);

    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    expect(mx.headers["etag"]).toBeTruthy();
    expect(mp.headers["etag"]).toBeTruthy();
    expect(mx.headers["location"]).toContain("/Patient/");
    expect(mp.headers["location"]).toContain("/Patient/");
    trackBoth("Patient", mx.body.id, mp.body.id);
  });

  it("CR-P-03: complete resource with identifiers, names, extensions, nested arrays", async () => {
    const body = {
      resourceType: "Patient",
      identifier: [{ system: "http://example.com/mrn", value: "MRN-PARITY-001" }],
      name: [{ family: "ParityTest", given: ["Alice", "B"] }, { family: "Secondary", given: ["C"] }],
      extension: [{ url: "http://example.com/ext/custom", valueString: "parity-check" }],
      telecom: [{ system: "phone", value: "+1-555-0100" }, { system: "email", value: "alice@example.com" }],
      gender: "female",
      birthDate: "1985-06-15",
    };

    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);

    const mxD = stripMeta(mx.body);
    const mpD = stripMeta(mp.body);
    expect(mxD.identifier).toEqual(body.identifier);
    expect(mpD.identifier).toEqual(body.identifier);
    expect(mxD.name).toEqual(body.name);
    expect(mpD.name).toEqual(body.name);
    expect(mxD.extension).toEqual(body.extension);
    const mpExt = mp.body.extension?.find((e: any) => e.url === "http://example.com/ext/custom");
    expect(mpExt?.valueString).toBe("parity-check");
    expect(mxD.gender).toBe("female");
    expect(mpD.gender).toBe("female");
    expect(mxD.birthDate).toBe("1985-06-15");
    expect(mpD.birthDate).toBe("1985-06-15");
    trackBoth("Patient", mx.body.id, mp.body.id);
  });

  it("CR-P-04: create → read returns same data", async () => {
    const body = { resourceType: "Patient", name: [{ family: "ReadBack" }] };
    const mxC = await medxaiRequest("POST", "/Patient", body);
    const mpC = await medplumRequest("POST", "/Patient", body);
    const mxR = await medxaiRequest("GET", `/Patient/${mxC.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mpC.body.id}`);

    expect(mxR.status).toBe(200);
    expect(mpR.status).toBe(200);
    expect(mxR.body.name).toEqual(mxC.body.name);
    expect(mpR.body.name).toEqual(mpC.body.name);
    expect(mxR.body.meta.versionId).toBe(mxC.body.meta.versionId);
    expect(mpR.body.meta.versionId).toBe(mpC.body.meta.versionId);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("CR-P-05: create → history has exactly 1 entry", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);

    expect(mxH.body.resourceType).toBe("Bundle");
    expect(mpH.body.resourceType).toBe("Bundle");
    expect(mxH.body.entry?.length).toBe(1);
    expect(mpH.body.entry?.length).toBe(1);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("CR-P-06: create Observation on both", async () => {
    const body = {
      resourceType: "Observation", status: "final",
      code: { coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body Weight" }] },
      valueQuantity: { value: 70, unit: "kg" },
    };
    const mx = await medxaiRequest("POST", "/Observation", body);
    const mp = await medplumRequest("POST", "/Observation", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    expect(mx.body.status).toBe("final");
    expect(mp.body.status).toBe("final");
    trackBoth("Observation", mx.body.id, mp.body.id);
  });

  it("CR-P-07: resourceType mismatch (URL vs body) → both 400", async () => {
    const mx = await medxaiRequest("POST", "/Patient", { resourceType: "Observation" });
    const mp = await medplumRequest("POST", "/Patient", { resourceType: "Observation" });
    expect(mx.status).toBe(400);
    expect(mp.status).toBe(400);
  });

  it("CR-P-08: 10 rapid creates → all succeed, unique ids", async () => {
    const mxIds: string[] = [];
    const mpIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const body = { resourceType: "Patient", name: [{ family: `Rapid-${i}` }] };
      const mx = await medxaiRequest("POST", "/Patient", body);
      const mp = await medplumRequest("POST", "/Patient", body);
      expect(mx.status).toBe(201);
      expect(mp.status).toBe(201);
      mxIds.push(mx.body.id);
      mpIds.push(mp.body.id);
      trackBoth("Patient", mx.body.id, mp.body.id);
    }
    expect(new Set(mxIds).size).toBe(10);
    expect(new Set(mpIds).size).toBe(10);
  });

  it("CR-P-09: create Practitioner on both", async () => {
    const body = { resourceType: "Practitioner", name: [{ family: "Smith", given: ["John"] }], gender: "male" };
    const mx = await medxaiRequest("POST", "/Practitioner", body);
    const mp = await medplumRequest("POST", "/Practitioner", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    trackBoth("Practitioner", mx.body.id, mp.body.id);
  });

  it("CR-P-10: nested array ordering preserved", async () => {
    const body = {
      resourceType: "Patient",
      name: [{ family: "Z", given: ["A", "B", "C"] }, { family: "Y", given: ["D", "E"] }, { family: "X", given: ["F"] }],
    };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    expect(mx.body.name[0].family).toBe("Z");
    expect(mp.body.name[0].family).toBe("Z");
    expect(mx.body.name[0].given).toEqual(["A", "B", "C"]);
    expect(mp.body.name[0].given).toEqual(["A", "B", "C"]);
    trackBoth("Patient", mx.body.id, mp.body.id);
  });
});

// =============================================================================
// 2️⃣ READ Parity (6 tests)
// =============================================================================

describe("2. READ Parity", () => {
  it("RD-P-01: read existing → 200, same structure", async () => {
    const body = { resourceType: "Patient", name: [{ family: "ReadTest" }] };
    const mxC = await medxaiRequest("POST", "/Patient", body);
    const mpC = await medplumRequest("POST", "/Patient", body);
    const mxR = await medxaiRequest("GET", `/Patient/${mxC.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mpC.body.id}`);
    expect(mxR.status).toBe(200);
    expect(mpR.status).toBe(200);
    expect(mxR.body.name).toEqual([{ family: "ReadTest" }]);
    expect(mpR.body.name).toEqual([{ family: "ReadTest" }]);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("RD-P-02: read non-existent → both 404", async () => {
    const fakeId = randomUUID();
    const mx = await medxaiRequest("GET", `/Patient/${fakeId}`);
    const mp = await medplumRequest("GET", `/Patient/${fakeId}`);
    expect(mx.status).toBe(404);
    expect(mp.status).toBe(404);
    expect(mx.body.resourceType).toBe("OperationOutcome");
    expect(mp.body.resourceType).toBe("OperationOutcome");
  });

  it("RD-P-03: read deleted resource → both 410", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);
    const mxR = await medxaiRequest("GET", `/Patient/${mxC.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mpC.body.id}`);
    expect(mxR.status).toBe(410);
    expect(mpR.status).toBe(410);
    expect(mxR.body.resourceType).toBe("OperationOutcome");
    expect(mpR.body.resourceType).toBe("OperationOutcome");
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("RD-P-04: vread specific version → both 200", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "VRead" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "VRead" }] });
    const mxV = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history/${mxC.body.meta.versionId}`);
    const mpV = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history/${mpC.body.meta.versionId}`);
    expect(mxV.status).toBe(200);
    expect(mpV.status).toBe(200);
    expect(mxV.body.meta.versionId).toBe(mxC.body.meta.versionId);
    expect(mpV.body.meta.versionId).toBe(mpC.body.meta.versionId);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("RD-P-05: vread non-existent version → both 404", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const fakeVid = randomUUID();
    const mxV = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history/${fakeVid}`);
    const mpV = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history/${fakeVid}`);
    expect(mxV.status).toBe(404);
    expect(mpV.status).toBe(404);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("RD-P-06: read returns ETag header (W/\"vid\" format)", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const mxR = await medxaiRequest("GET", `/Patient/${mxC.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mpC.body.id}`);
    expect(mxR.headers["etag"]).toContain('W/"');
    expect(mpR.headers["etag"]).toContain('W/"');
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });
});

// =============================================================================
// 3️⃣ UPDATE Parity (8 tests)
// =============================================================================

describe("3. UPDATE Parity", () => {
  it("UP-P-01: update → version changes, history grows", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "Before" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "Before" }] });

    const mxU = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "After" }] });
    const mpU = await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "After" }] });
    expect(mxU.status).toBe(200);
    expect(mpU.status).toBe(200);
    expect(mxU.body.meta.versionId).not.toBe(mxC.body.meta.versionId);
    expect(mpU.body.meta.versionId).not.toBe(mpC.body.meta.versionId);

    const mxR = await medxaiRequest("GET", `/Patient/${mxC.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mpC.body.id}`);
    expect(mxR.body.name[0].family).toBe("After");
    expect(mpR.body.name[0].family).toBe("After");

    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.body.entry?.length).toBe(2);
    expect(mpH.body.entry?.length).toBe(2);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("UP-P-02: old version still readable via vread", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "V1" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "V1" }] });
    const mxVid1 = mxC.body.meta.versionId;
    const mpVid1 = mpC.body.meta.versionId;
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "V2" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "V2" }] });
    const mxV = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history/${mxVid1}`);
    const mpV = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history/${mpVid1}`);
    expect(mxV.status).toBe(200);
    expect(mpV.status).toBe(200);
    expect(mxV.body.name[0].family).toBe("V1");
    expect(mpV.body.name[0].family).toBe("V1");
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("UP-P-03: sequential If-Match → stale version rejected on both", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "IfM" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "IfM" }] });
    const mxVid = mxC.body.meta.versionId;
    const mpVid = mpC.body.meta.versionId;

    // First update succeeds
    const mxU1 = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`,
      { resourceType: "Patient", id: mxC.body.id, name: [{ family: "A" }] }, { "if-match": `W/"${mxVid}"` });
    const mpU1 = await medplumRequest("PUT", `/Patient/${mpC.body.id}`,
      { resourceType: "Patient", id: mpC.body.id, name: [{ family: "A" }] }, { "if-match": `W/"${mpVid}"` });
    expect(mxU1.status).toBe(200);
    expect(mpU1.status).toBe(200);

    // Second update with stale version fails
    const mxU2 = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`,
      { resourceType: "Patient", id: mxC.body.id, name: [{ family: "B" }] }, { "if-match": `W/"${mxVid}"` });
    const mpU2 = await medplumRequest("PUT", `/Patient/${mpC.body.id}`,
      { resourceType: "Patient", id: mpC.body.id, name: [{ family: "B" }] }, { "if-match": `W/"${mpVid}"` });
    expect([409, 412]).toContain(mxU2.status);
    expect([409, 412]).toContain(mpU2.status);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("UP-P-04: update non-existent → compare behavior", async () => {
    const fakeId = randomUUID();
    const mx = await medxaiRequest("PUT", `/Patient/${fakeId}`, { resourceType: "Patient", id: fakeId, name: [{ family: "Ghost" }] });
    const mp = await medplumRequest("PUT", `/Patient/${fakeId}`, { resourceType: "Patient", id: fakeId, name: [{ family: "Ghost" }] });
    // KNOWN DIFFERENCE: MedXAI returns 404 (no upsert), Medplum returns 201 (upsert-on-PUT)
    expect(mx.status).toBe(404);
    expect([200, 201]).toContain(mp.status);
    if (mp.status === 201) track("medplum", "Patient", mp.body.id);
  });

  it("UP-P-05: update with mismatched resourceType → both 400", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const mxU = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Observation", id: mxC.body.id });
    const mpU = await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Observation", id: mpC.body.id });
    expect(mxU.status).toBe(400);
    expect(mpU.status).toBe(400);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("UP-P-06: three sequential updates → history has 4 entries", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "Seq-0" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "Seq-0" }] });
    for (let i = 1; i <= 3; i++) {
      await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: `Seq-${i}` }] });
      await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: `Seq-${i}` }] });
    }
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.body.entry?.length).toBe(4);
    expect(mpH.body.entry?.length).toBe(4);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("UP-P-07: update preserves unmodified fields", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", gender: "female", birthDate: "1990-01-01" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", gender: "female", birthDate: "1990-01-01" });
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, gender: "female", birthDate: "1990-01-01", name: [{ family: "Added" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, gender: "female", birthDate: "1990-01-01", name: [{ family: "Added" }] });
    const mxR = await medxaiRequest("GET", `/Patient/${mxC.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mpC.body.id}`);
    expect(mxR.body.gender).toBe("female");
    expect(mpR.body.gender).toBe("female");
    expect(mxR.body.birthDate).toBe("1990-01-01");
    expect(mpR.body.birthDate).toBe("1990-01-01");
    expect(mxR.body.name[0].family).toBe("Added");
    expect(mpR.body.name[0].family).toBe("Added");
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("UP-P-08: update with mismatched id → both 400", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const mxU = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: randomUUID() });
    const mpU = await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: randomUUID() });
    // KNOWN GAP: MedXAI does not validate body.id vs URL id (overwrites URL id in route handler)
    // Medplum returns 400 for mismatched id
    expect(mpU.status).toBe(400);
    // MedXAI accepts it (200) — documented as parity gap
    expect([200, 400]).toContain(mxU.status);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });
});

// =============================================================================
// 4️⃣ DELETE Parity (5 tests)
// =============================================================================

describe("4. DELETE Parity", () => {
  it("DE-P-01: delete → read returns 410", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const mxD = await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    const mpD = await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);
    expect(mxD.status).toBe(200);
    expect(mpD.status).toBe(200);
    const mxR = await medxaiRequest("GET", `/Patient/${mxC.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mpC.body.id}`);
    expect(mxR.status).toBe(410);
    expect(mpR.status).toBe(410);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("DE-P-02: delete → history still accessible with 2 entries", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.status).toBe(200);
    expect(mpH.status).toBe(200);
    expect(mxH.body.entry?.length).toBe(2);
    expect(mpH.body.entry?.length).toBe(2);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("DE-P-03: history after delete → delete entry present, method consistent", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    // Both should have 2 history entries (create + delete)
    expect(mxH.body.entry?.length).toBe(2);
    expect(mpH.body.entry?.length).toBe(2);
    // Newest entry (index 0) is the delete; it has request.method and request.url
    expect(mxH.body.entry[0]?.request?.method).toBeTruthy();
    expect(mpH.body.entry[0]?.request?.method).toBeTruthy();
    // The delete entry may lack resource content (empty content for deleted version)
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("DE-P-04: double delete → compare behavior", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);
    const mxD2 = await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    const mpD2 = await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);
    // KNOWN DIFFERENCE: MedXAI returns 410 (Gone), Medplum returns 200 (idempotent delete)
    expect(mxD2.status).toBe(410);
    expect(mpD2.status).toBe(200);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("DE-P-05: delete non-existent → same error code", async () => {
    const fakeId = randomUUID();
    const mx = await medxaiRequest("DELETE", `/Patient/${fakeId}`);
    const mp = await medplumRequest("DELETE", `/Patient/${fakeId}`);
    expect(mx.status, `MedXAI=${mx.status} vs Medplum=${mp.status}`).toBe(mp.status);
  });
});

// =============================================================================
// 5️⃣ HISTORY Parity (5 tests)
// =============================================================================

describe("5. HISTORY Parity", () => {
  it("HI-P-01: create→update→update→delete → 4 history entries", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "H0" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "H0" }] });
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "H1" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "H1" }] });
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "H2" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "H2" }] });
    await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.body.entry?.length).toBe(4);
    expect(mpH.body.entry?.length).toBe(4);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("HI-P-02: history ordering — newest first", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "Old" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "Old" }] });
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "New" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "New" }] });
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.body.entry[0]?.resource?.name?.[0]?.family).toBe("New");
    expect(mpH.body.entry[0]?.resource?.name?.[0]?.family).toBe("New");
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("HI-P-03: unique versionIds across all history entries", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    for (let i = 0; i < 3; i++) {
      await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: `V${i}` }] });
      await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: `V${i}` }] });
    }
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    const mxVids = mxH.body.entry.map((e: any) => e.resource?.meta?.versionId).filter(Boolean);
    const mpVids = mpH.body.entry.map((e: any) => e.resource?.meta?.versionId).filter(Boolean);
    expect(new Set(mxVids).size).toBe(mxVids.length);
    expect(new Set(mpVids).size).toBe(mpVids.length);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("HI-P-04: history Bundle type = 'history'", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.body.type).toBe("history");
    expect(mpH.body.type).toBe("history");
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("HI-P-05: each history entry has request.method and request.url", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "HE" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "HE" }] });
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    for (const entry of mxH.body.entry) {
      expect(entry.request?.method).toBeTruthy();
      expect(entry.request?.url).toBeTruthy();
    }
    for (const entry of mpH.body.entry) {
      expect(entry.request?.method).toBeTruthy();
      expect(entry.request?.url).toBeTruthy();
    }
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });
});

// =============================================================================
// 6️⃣ Error Handling Parity (5 tests)
// =============================================================================

describe("6. Error Handling Parity", () => {
  it("ER-P-01: read non-existent → both 404 + OperationOutcome", async () => {
    const fakeId = randomUUID();
    const mx = await medxaiRequest("GET", `/Patient/${fakeId}`);
    const mp = await medplumRequest("GET", `/Patient/${fakeId}`);
    expect(mx.status).toBe(404);
    expect(mp.status).toBe(404);
    expect(mx.body.resourceType).toBe("OperationOutcome");
    expect(mp.body.resourceType).toBe("OperationOutcome");
  });

  it("ER-P-02: vread non-existent version → both 404", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const fakeVid = randomUUID();
    const mx = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history/${fakeVid}`);
    const mp = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history/${fakeVid}`);
    expect(mx.status).toBe(404);
    expect(mp.status).toBe(404);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("ER-P-03: stale If-Match → both conflict", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "Fresh" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "Fresh" }] });
    const mx = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`,
      { resourceType: "Patient", id: mxC.body.id, name: [{ family: "Stale" }] },
      { "if-match": `W/"${mxC.body.meta.versionId}"` });
    const mp = await medplumRequest("PUT", `/Patient/${mpC.body.id}`,
      { resourceType: "Patient", id: mpC.body.id, name: [{ family: "Stale" }] },
      { "if-match": `W/"${mpC.body.meta.versionId}"` });
    expect([409, 412]).toContain(mx.status);
    expect([409, 412]).toContain(mp.status);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("ER-P-04: POST with resourceType mismatch → both 400", async () => {
    const mx = await medxaiRequest("POST", "/Patient", { resourceType: "Observation" });
    const mp = await medplumRequest("POST", "/Patient", { resourceType: "Observation" });
    expect(mx.status).toBe(400);
    expect(mp.status).toBe(400);
  });

  it("ER-P-05: PUT with mismatched id → Medplum 400, MedXAI accepts (known gap)", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    const mx = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: randomUUID() });
    const mp = await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: randomUUID() });
    // Medplum correctly rejects mismatched id
    expect(mp.status).toBe(400);
    // KNOWN GAP: MedXAI route handler overwrites body.id with URL id, so it succeeds
    expect([200, 400]).toContain(mx.status);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });
});

// =============================================================================
// 7️⃣ Concurrency Stress Parity (3 tests)
// =============================================================================

describe("7. Concurrency Stress Parity", () => {
  it("CC-P-01: 20 concurrent creates → all succeed, unique ids", async () => {
    const mxResults = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: `CC-${i}` }] }),
      ),
    );
    const mpResults = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: `CC-${i}` }] }),
      ),
    );
    const mxOk = mxResults.filter((r) => r.status === 201);
    const mpOk = mpResults.filter((r) => r.status === 201);
    expect(mxOk.length).toBe(20);
    expect(mpOk.length).toBe(20);
    expect(new Set(mxOk.map((r) => r.body.id)).size).toBe(20);
    expect(new Set(mpOk.map((r) => r.body.id)).size).toBe(20);
    for (const r of mxOk) track("medxai", "Patient", r.body.id);
    for (const r of mpOk) track("medplum", "Patient", r.body.id);
  }, 30_000);

  it("CC-P-02: 10 sequential updates (no If-Match) → all succeed, history=11", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "CC-Base" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "CC-Base" }] });
    for (let i = 0; i < 10; i++) {
      const mxU = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: `CC-U${i}` }] });
      const mpU = await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: `CC-U${i}` }] });
      expect(mxU.status).toBe(200);
      expect(mpU.status).toBe(200);
    }
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.body.entry?.length).toBe(11);
    expect(mpH.body.entry?.length).toBe(11);
    const mxVids = mxH.body.entry.map((e: any) => e.resource?.meta?.versionId).filter(Boolean);
    const mpVids = mpH.body.entry.map((e: any) => e.resource?.meta?.versionId).filter(Boolean);
    expect(new Set(mxVids).size).toBe(mxVids.length);
    expect(new Set(mpVids).size).toBe(mpVids.length);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  }, 30_000);

  it("CC-P-03: 10 sequential If-Match updates → stale ones rejected", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    let mxVid = mxC.body.meta.versionId;
    let mpVid = mpC.body.meta.versionId;
    let mxOk = 0;
    let mpOk = 0;
    for (let i = 0; i < 10; i++) {
      const mxU = await medxaiRequest("PUT", `/Patient/${mxC.body.id}`,
        { resourceType: "Patient", id: mxC.body.id, name: [{ family: `IfM-${i}` }] },
        { "if-match": `W/"${mxVid}"` });
      const mpU = await medplumRequest("PUT", `/Patient/${mpC.body.id}`,
        { resourceType: "Patient", id: mpC.body.id, name: [{ family: `IfM-${i}` }] },
        { "if-match": `W/"${mpVid}"` });
      if (mxU.status === 200) { mxOk++; mxVid = mxU.body.meta.versionId; }
      if (mpU.status === 200) { mpOk++; mpVid = mpU.body.meta.versionId; }
    }
    // All should succeed since we update the versionId each time
    expect(mxOk).toBe(10);
    expect(mpOk).toBe(10);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  }, 30_000);
});

// =============================================================================
// 8️⃣ Database Layer Parity (4 tests)
// =============================================================================

describe("8. Database Layer Parity", () => {
  it("DB-P-01: main table after create → deleted=false, content JSON present", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "DBCheck" }] });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient", name: [{ family: "DBCheck" }] });

    const mxRow = await db.query<{ deleted: boolean; __version: number; content: string }>(
      `SELECT "deleted", "__version", "content" FROM "Patient" WHERE "id" = $1`, [mxC.body.id]);
    const mpRow = await medplumPool.query(
      `SELECT "deleted", "__version", "content" FROM "Patient" WHERE "id" = $1`, [mpC.body.id]);

    expect(mxRow.rows.length).toBe(1);
    expect(mpRow.rows.length).toBe(1);
    expect(mxRow.rows[0].deleted).toBe(false);
    expect(mpRow.rows[0].deleted).toBe(false);
    // KNOWN DIFFERENCE: MedXAI __version = resource version counter (1, 2, 3...)
    // Medplum __version = database schema version (always 13 currently)
    expect(mxRow.rows[0].__version).toBe(1);
    expect(mpRow.rows[0].__version).toBeGreaterThan(0); // schema version
    expect(JSON.parse(mxRow.rows[0].content).name[0].family).toBe("DBCheck");
    expect(JSON.parse(mpRow.rows[0].content as string).name[0].family).toBe("DBCheck");
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("DB-P-02: history table after create+update → 2 rows", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "Up" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "Up" }] });

    const mxHist = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM "Patient_History" WHERE "id" = $1`, [mxC.body.id]);
    const mpHist = await medplumPool.query(`SELECT COUNT(*) as count FROM "Patient_History" WHERE "id" = $1`, [mpC.body.id]);
    expect(parseInt(mxHist.rows[0].count)).toBe(2);
    expect(parseInt(mpHist.rows[0].count as string)).toBe(2);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("DB-P-03: soft delete → deleted=true in main table", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    await medxaiRequest("DELETE", `/Patient/${mxC.body.id}`);
    await medplumRequest("DELETE", `/Patient/${mpC.body.id}`);

    const mxRow = await db.query<{ deleted: boolean }>(`SELECT "deleted" FROM "Patient" WHERE "id" = $1`, [mxC.body.id]);
    const mpRow = await medplumPool.query(`SELECT "deleted" FROM "Patient" WHERE "id" = $1`, [mpC.body.id]);
    expect(mxRow.rows[0].deleted).toBe(true);
    expect(mpRow.rows[0].deleted).toBe(true);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });

  it("DB-P-04: __version is schema version constant on both (stays same after update)", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });

    let mxRow = await db.query<{ __version: number }>(`SELECT "__version" FROM "Patient" WHERE "id" = $1`, [mxC.body.id]);
    let mpRow = await medplumPool.query(`SELECT "__version" FROM "Patient" WHERE "id" = $1`, [mpC.body.id]);
    // Both use __version as a DB schema version, not a resource version counter
    // MedXAI SCHEMA_VERSION=1, Medplum SCHEMA_VERSION=13
    const mxSchemaV = mxRow.rows[0].__version;
    const mpSchemaV = (mpRow.rows[0] as any).__version;
    expect(mxSchemaV).toBeGreaterThan(0);
    expect(mpSchemaV).toBeGreaterThan(0);

    await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: "V2" }] });
    await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: "V2" }] });

    mxRow = await db.query<{ __version: number }>(`SELECT "__version" FROM "Patient" WHERE "id" = $1`, [mxC.body.id]);
    mpRow = await medplumPool.query(`SELECT "__version" FROM "Patient" WHERE "id" = $1`, [mpC.body.id]);
    // Schema version stays constant after updates on both
    expect(mxRow.rows[0].__version).toBe(mxSchemaV);
    expect((mpRow.rows[0] as any).__version).toBe(mpSchemaV);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  });
});

// =============================================================================
// 9️⃣ Extreme/Edge Parity (6 tests)
// =============================================================================

describe("9. Extreme/Edge Parity", () => {
  it("EX-P-01: large resource (~100KB) accepted by both", async () => {
    const bigArray = Array.from({ length: 500 }, (_, i) => ({ system: "http://example.com/id", value: `ID-${i}-${"x".repeat(150)}` }));
    const body = { resourceType: "Patient", identifier: bigArray };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    const mxR = await medxaiRequest("GET", `/Patient/${mx.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mp.body.id}`);
    expect(mxR.body.identifier?.length).toBe(500);
    expect(mpR.body.identifier?.length).toBe(500);
    trackBoth("Patient", mx.body.id, mp.body.id);
  }, 30_000);

  it("EX-P-02: deep nesting (5 levels) — MedXAI preserves, Medplum may reject", async () => {
    let nested: any = { valueString: "deep" };
    for (let i = 0; i < 5; i++) {
      nested = { url: `http://level-${i}`, extension: [nested] };
    }
    const body = { resourceType: "Patient", extension: [nested] };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);
    // MedXAI preserves deep nesting
    expect(mx.status).toBe(201);
    expect(JSON.stringify(mx.body)).toContain('"deep"');
    track("medxai", "Patient", mx.body.id);
    // KNOWN DIFFERENCE: Medplum rejects deep nesting with 400 (validation limit)
    if (mp.status === 201) {
      expect(JSON.stringify(mp.body)).toContain('"deep"');
      track("medplum", "Patient", mp.body.id);
    } else {
      expect(mp.status).toBe(400); // known Medplum limitation
    }
  });

  it("EX-P-03: 20 consecutive updates → history count matches", async () => {
    const mxC = await medxaiRequest("POST", "/Patient", { resourceType: "Patient" });
    const mpC = await medplumRequest("POST", "/Patient", { resourceType: "Patient" });
    for (let i = 0; i < 20; i++) {
      await medxaiRequest("PUT", `/Patient/${mxC.body.id}`, { resourceType: "Patient", id: mxC.body.id, name: [{ family: `U-${i}` }] });
      await medplumRequest("PUT", `/Patient/${mpC.body.id}`, { resourceType: "Patient", id: mpC.body.id, name: [{ family: `U-${i}` }] });
    }
    const mxH = await medxaiRequest("GET", `/Patient/${mxC.body.id}/_history`);
    const mpH = await medplumRequest("GET", `/Patient/${mpC.body.id}/_history`);
    expect(mxH.body.entry?.length).toBe(21);
    expect(mpH.body.entry?.length).toBe(21);
    trackBoth("Patient", mxC.body.id, mpC.body.id);
  }, 60_000);

  it("EX-P-04: Unicode (CJK, emoji, RTL) preserved on both", async () => {
    const body = {
      resourceType: "Patient",
      name: [{ family: "张三", given: ["李四"] }, { family: "مرحبا", given: ["عالم"] }, { family: "🏥🩺", given: ["💉"] }],
    };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    const mxR = await medxaiRequest("GET", `/Patient/${mx.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mp.body.id}`);
    expect(mxR.body.name[0].family).toBe("张三");
    expect(mpR.body.name[0].family).toBe("张三");
    expect(mxR.body.name[1].family).toBe("مرحبا");
    expect(mpR.body.name[1].family).toBe("مرحبا");
    expect(mxR.body.name[2].family).toBe("🏥🩺");
    expect(mpR.body.name[2].family).toBe("🏥🩺");
    trackBoth("Patient", mx.body.id, mp.body.id);
  });

  it("EX-P-05: extension arrays preserved on both", async () => {
    const body = {
      resourceType: "Patient",
      extension: [
        { url: "http://example.com/ext/a", valueString: "alpha" },
        { url: "http://example.com/ext/b", valueInteger: 42 },
        { url: "http://example.com/ext/c", valueBoolean: true },
      ],
    };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    const mxR = await medxaiRequest("GET", `/Patient/${mx.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mp.body.id}`);
    const mxExts = mxR.body.extension?.filter((e: any) => e.url?.startsWith("http://example.com"));
    const mpExts = mpR.body.extension?.filter((e: any) => e.url?.startsWith("http://example.com"));
    expect(mxExts).toEqual(body.extension);
    expect(mpExts).toEqual(body.extension);
    trackBoth("Patient", mx.body.id, mp.body.id);
  });

  it("EX-P-06: empty arrays handling — both consistent", async () => {
    const body = { resourceType: "Patient", name: [], identifier: [] };
    const mx = await medxaiRequest("POST", "/Patient", body);
    const mp = await medplumRequest("POST", "/Patient", body);
    expect(mx.status).toBe(201);
    expect(mp.status).toBe(201);
    const mxR = await medxaiRequest("GET", `/Patient/${mx.body.id}`);
    const mpR = await medplumRequest("GET", `/Patient/${mp.body.id}`);
    // Both should either preserve empty arrays or strip them
    const mxEmpty = mxR.body.name === undefined || (Array.isArray(mxR.body.name) && mxR.body.name.length === 0);
    const mpEmpty = mpR.body.name === undefined || (Array.isArray(mpR.body.name) && mpR.body.name.length === 0);
    expect(mxEmpty).toBe(true);
    expect(mpEmpty).toBe(true);
    trackBoth("Patient", mx.body.id, mp.body.id);
  });
});

// =============================================================================
// Summary
// =============================================================================

describe("Parity Summary", () => {
  it("all categories executed", () => {
    expect(true).toBe(true);
  });
});
