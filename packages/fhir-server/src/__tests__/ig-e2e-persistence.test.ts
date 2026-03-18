/**
 * IG Persistence E2E Tests
 *
 * End-to-end tests for IG import pipeline using fhir-persistence directly.
 * Tests both SQLite and PostgreSQL (PG skipped if not configured).
 *
 * Test Flow:
 * 1. Initialize database (create all conformance tables)
 * 2. Import a simulated US Core IG bundle
 * 3. Verify all tables are populated correctly
 * 4. Update the IG (simulate version bump)
 * 5. Verify update (upsert) works correctly
 *
 * @module fhir-server/__tests__
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Import fhir-persistence conformance module (local v0.7.0)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fp = require("fhir-persistence");

const {
  BetterSqlite3Adapter,
  IGImportOrchestrator,
  IGResourceMapRepo,
  SDIndexRepo,
  ElementIndexRepo,
  ExpansionCacheRepo,
  ConceptHierarchyRepo,
  SearchParamIndexRepo,
} = fp;

// =============================================================================
// Test Data: Simulated US Core IG Bundle (v6.1.0)
// =============================================================================

function createUSCoreBundle(version: string) {
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        resource: {
          resourceType: "ImplementationGuide",
          id: "hl7-fhir-us-core",
          url: "http://hl7.org/fhir/us/core/ImplementationGuide/hl7.fhir.us.core",
          version,
          name: "USCore",
          title: "US Core Implementation Guide",
          status: "active",
        },
      },
      {
        resource: {
          resourceType: "StructureDefinition",
          id: "us-core-patient",
          url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
          version,
          name: "USCorePatientProfile",
          type: "Patient",
          kind: "resource",
          baseDefinition: "http://hl7.org/fhir/StructureDefinition/Patient",
          derivation: "constraint",
          snapshot: {
            element: [
              { id: "Patient", path: "Patient", min: 0, max: "*", type: [{ code: "Patient" }] },
              { id: "Patient.name", path: "Patient.name", min: 1, max: "*", type: [{ code: "HumanName" }], mustSupport: true },
              { id: "Patient.identifier", path: "Patient.identifier", min: 1, max: "*", type: [{ code: "Identifier" }], mustSupport: true },
              { id: "Patient.gender", path: "Patient.gender", min: 1, max: "1", type: [{ code: "code" }], mustSupport: true, binding: { valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender" } },
              { id: "Patient.birthDate", path: "Patient.birthDate", min: 0, max: "1", type: [{ code: "date" }], mustSupport: true },
              {
                id: "Patient.extension:race",
                path: "Patient.extension",
                sliceName: "race",
                min: 0, max: "1",
                type: [{ code: "Extension", profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-race"] }],
              },
            ],
          },
        },
      },
      {
        resource: {
          resourceType: "StructureDefinition",
          id: "us-core-race",
          url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
          version,
          name: "USCoreRaceExtension",
          type: "Extension",
          kind: "complex-type",
          baseDefinition: "http://hl7.org/fhir/StructureDefinition/Extension",
          derivation: "constraint",
          snapshot: {
            element: [
              { id: "Extension", path: "Extension", min: 0, max: "1", type: [{ code: "Extension" }] },
              { id: "Extension.value[x]", path: "Extension.value[x]", min: 0, max: "1", type: [{ code: "Coding" }], binding: { valueSet: "http://hl7.org/fhir/us/core/ValueSet/omb-race-category" } },
            ],
          },
        },
      },
      {
        resource: {
          resourceType: "StructureDefinition",
          id: "us-core-observation-lab",
          url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab",
          version,
          name: "USCoreLaboratoryResultObservationProfile",
          type: "Observation",
          kind: "resource",
          baseDefinition: "http://hl7.org/fhir/StructureDefinition/Observation",
          derivation: "constraint",
          snapshot: {
            element: [
              { id: "Observation", path: "Observation", min: 0, max: "*", type: [{ code: "Observation" }] },
              { id: "Observation.status", path: "Observation.status", min: 1, max: "1", type: [{ code: "code" }], mustSupport: true },
              { id: "Observation.category", path: "Observation.category", min: 1, max: "*", type: [{ code: "CodeableConcept" }], mustSupport: true },
              { id: "Observation.code", path: "Observation.code", min: 1, max: "1", type: [{ code: "CodeableConcept" }], mustSupport: true },
            ],
          },
        },
      },
      {
        resource: {
          resourceType: "ValueSet",
          id: "omb-race-category",
          url: "http://hl7.org/fhir/us/core/ValueSet/omb-race-category",
          version,
          name: "OmbRaceCategory",
        },
      },
      {
        resource: {
          resourceType: "ValueSet",
          id: "us-core-gender",
          url: "http://hl7.org/fhir/us/core/ValueSet/us-core-gender",
          version,
          name: "USCoreGender",
        },
      },
      {
        resource: {
          resourceType: "CodeSystem",
          id: "us-core-condition-category",
          url: "http://hl7.org/fhir/us/core/CodeSystem/condition-category",
          version,
          name: "USCoreConditionCategory",
          concept: [
            {
              code: "health-concern",
              display: "Health Concern",
              concept: [
                { code: "sdoh", display: "SDOH" },
                { code: "functional-status", display: "Functional Status" },
              ],
            },
            { code: "encounter-diagnosis", display: "Encounter Diagnosis" },
          ],
        },
      },
      {
        resource: {
          resourceType: "SearchParameter",
          id: "us-core-race",
          url: "http://hl7.org/fhir/us/core/SearchParameter/us-core-race",
          version,
          name: "USCoreRace",
          code: "race",
          type: "token",
          base: ["Patient"],
          expression: "Patient.extension.where(url='http://hl7.org/fhir/us/core/StructureDefinition/us-core-race').extension.value.ofType(Coding)",
        },
      },
      {
        resource: {
          resourceType: "SearchParameter",
          id: "us-core-ethnicity",
          url: "http://hl7.org/fhir/us/core/SearchParameter/us-core-ethnicity",
          version,
          name: "USCoreEthnicity",
          code: "ethnicity",
          type: "token",
          base: ["Patient"],
          expression: "Patient.extension.where(url='http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity').extension.value.ofType(Coding)",
        },
      },
    ],
  };
}

// =============================================================================
// Simple element extractor (matches fhir-runtime extractElementIndexRows)
// =============================================================================

function extractElementIndex(sd: Record<string, unknown>) {
  const snapshot = sd.snapshot as { element?: Array<Record<string, unknown>> } | undefined;
  if (!snapshot?.element) return [];
  return snapshot.element.map((el: any) => ({
    id: `${sd.id}:${el.id ?? el.path}`,
    path: el.path,
    min: el.min,
    max: el.max,
    typeCodes: (el.type ?? []).map((t: any) => t.code),
    isSlice: !!el.sliceName,
    sliceName: el.sliceName,
    isExtension: (el.type ?? []).some((t: any) => t.code === "Extension"),
    bindingValueSet: el.binding?.valueSet,
    mustSupport: el.mustSupport ?? false,
  }));
}

// Simple concept flattener
function flattenConcepts(cs: Record<string, unknown>) {
  const url = cs.url as string;
  const version = cs.version as string | undefined;
  const rows: any[] = [];
  let counter = 0;

  function walk(concepts: any[], parentCode: string | null, level: number) {
    for (const c of concepts ?? []) {
      rows.push({
        id: `${url}:${counter++}`,
        codeSystemUrl: url,
        codeSystemVersion: version,
        code: c.code,
        display: c.display,
        parentCode,
        level,
      });
      if (c.concept) walk(c.concept, c.code, level + 1);
    }
  }

  walk(cs.concept as any[] ?? [], null, 0);
  return rows;
}

// =============================================================================
// SQLite E2E Tests
// =============================================================================

describe("IG Persistence E2E — SQLite", () => {
  let adapter: InstanceType<typeof BetterSqlite3Adapter>;
  let orchestrator: InstanceType<typeof IGImportOrchestrator>;

  beforeAll(async () => {
    // Use in-memory SQLite for speed
    adapter = new BetterSqlite3Adapter({ filename: ":memory:" });
    orchestrator = new IGImportOrchestrator(adapter, "sqlite", {
      extractElementIndex,
      flattenConcepts,
    });
  });

  afterAll(async () => {
    await adapter.close();
  });

  // ── Step 1: Initialize Tables ─────────────────────────────────────────────
  it("Step 1: initializes all conformance tables", async () => {
    await orchestrator.ensureAllTables();
    // Verify tables exist by querying them (should not throw)
    const repos = orchestrator.repos;
    const index = await repos.resourceMap.getIGIndex("nonexistent");
    expect(index.profiles).toHaveLength(0);
  });

  // ── Step 2: Import US Core v6.1.0 ────────────────────────────────────────
  let importResult: any;
  it("Step 2: imports US Core v6.1.0 bundle", async () => {
    const bundle = createUSCoreBundle("6.1.0");
    importResult = await orchestrator.importIG("us-core", bundle as any);

    console.log("\n📦 Import Result (US Core v6.1.0):");
    console.log(`   Resources:       ${importResult.resourceCount}`);
    console.log(`   SD Indexes:      ${importResult.sdIndexCount}`);
    console.log(`   Element Indexes: ${importResult.elementIndexCount}`);
    console.log(`   Concepts:        ${importResult.conceptCount}`);
    console.log(`   SearchParams:    ${importResult.spIndexCount}`);
    console.log(`   Errors:          ${importResult.errors.length}`);

    expect(importResult.errors).toHaveLength(0);
    expect(importResult.resourceCount).toBe(9); // 1 IG + 3 SD + 2 VS + 1 CS + 2 SP
    expect(importResult.sdIndexCount).toBe(3);
    expect(importResult.elementIndexCount).toBeGreaterThan(0);
    expect(importResult.conceptCount).toBe(4); // health-concern, sdoh, functional-status, encounter-diagnosis
    expect(importResult.spIndexCount).toBe(2);
  });

  // ── Step 3: Verify all tables ────────────────────────────────────────────
  it("Step 3a: ig_resource_map — correct IG index", async () => {
    const repos = orchestrator.repos;
    const index = await repos.resourceMap.getIGIndex("us-core");

    console.log("\n📋 IG Index (us-core):");
    console.log(`   Profiles:         ${index.profiles.length}`);
    console.log(`   Extensions:       ${index.extensions.length}`);
    console.log(`   ValueSets:        ${index.valueSets.length}`);
    console.log(`   CodeSystems:      ${index.codeSystems.length}`);
    console.log(`   SearchParameters: ${index.searchParameters.length}`);

    // 2 profiles (Patient, Observation), 1 extension (race)
    expect(index.profiles.length).toBe(2);
    expect(index.extensions.length).toBe(1);
    expect(index.valueSets.length).toBe(2);
    expect(index.codeSystems.length).toBe(1);
    expect(index.searchParameters.length).toBe(2);

    // Verify profile details
    const patientProfile = index.profiles.find((p: any) => p.resourceId === "us-core-patient");
    expect(patientProfile).toBeDefined();
    expect(patientProfile!.baseType).toBe("Patient");

    // Extension has baseType "Extension" → classified as extension
    const raceExt = index.extensions.find((e: any) => e.resourceId === "us-core-race");
    expect(raceExt).toBeDefined();
  });

  it("Step 3b: structure_definition_index — SD metadata", async () => {
    const repos = orchestrator.repos;
    const sd = await repos.sdIndex.getById("us-core-patient");
    expect(sd).toBeDefined();
    expect(sd!.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient");
    expect(sd!.type).toBe("Patient");
    expect(sd!.kind).toBe("resource");
    expect(sd!.derivation).toBe("constraint");

    const byType = await repos.sdIndex.getByType("Patient");
    expect(byType.length).toBe(1);

    const obs = await repos.sdIndex.getByType("Observation");
    expect(obs.length).toBe(1);
    expect(obs[0].id).toBe("us-core-observation-lab");
  });

  it("Step 3c: structure_element_index — element details", async () => {
    const repos = orchestrator.repos;
    const elements = await repos.elementIndex.getByStructureId("us-core-patient");

    console.log(`\n🔍 Element Index (us-core-patient): ${elements.length} elements`);
    for (const el of elements) {
      console.log(`   ${el.path} [${el.typeCodes?.join(",")}] ${el.mustSupport ? "MS" : ""} ${el.isSlice ? `slice:${el.sliceName}` : ""}`);
    }

    expect(elements.length).toBe(6); // 6 elements in snapshot
    const nameEl = elements.find((e: any) => e.path === "Patient.name");
    expect(nameEl).toBeDefined();
    expect(nameEl!.mustSupport).toBe(true);
    expect(nameEl!.typeCodes).toEqual(["HumanName"]);

    const raceSlice = elements.find((e: any) => e.sliceName === "race");
    expect(raceSlice).toBeDefined();
    expect(raceSlice!.isSlice).toBe(true);
    expect(raceSlice!.isExtension).toBe(true);
  });

  it("Step 3d: code_system_concept — hierarchy", async () => {
    const repos = orchestrator.repos;
    const tree = await repos.conceptHierarchy.getTree("http://hl7.org/fhir/us/core/CodeSystem/condition-category");

    console.log(`\n🌳 Concept Hierarchy: ${tree.length} concepts`);
    for (const c of tree) {
      console.log(`   ${"  ".repeat(c.level)}${c.code} — ${c.display} (parent: ${c.parentCode ?? "root"})`);
    }

    expect(tree.length).toBe(4);
    const root = tree.filter((c: any) => c.level === 0);
    expect(root.length).toBe(2); // health-concern, encounter-diagnosis
    const children = tree.filter((c: any) => c.parentCode === "health-concern");
    expect(children.length).toBe(2); // sdoh, functional-status
  });

  it("Step 3e: search_parameter_index — SP entries", async () => {
    const repos = orchestrator.repos;
    const sps = await repos.searchParamIndex.getByIG("us-core");

    console.log(`\n🔎 SearchParameter Index: ${sps.length} params`);
    for (const sp of sps) {
      console.log(`   ${sp.code} (${sp.type}) → base: ${JSON.stringify(sp.base)}`);
    }

    expect(sps.length).toBe(2);
    const raceSP = sps.find((s: any) => s.code === "race");
    expect(raceSP).toBeDefined();
    expect(raceSP!.type).toBe("token");
    expect(raceSP!.base).toEqual(["Patient"]);
  });

  // ── Step 4: Update IG (simulate v7.0.0) ──────────────────────────────────
  let updateResult: any;
  it("Step 4: updates US Core to v7.0.0 (upsert)", async () => {
    const bundle = createUSCoreBundle("7.0.0");

    // Add a new profile in v7.0.0
    bundle.entry.push({
      resource: {
        resourceType: "StructureDefinition",
        id: "us-core-condition",
        url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition",
        version: "7.0.0",
        name: "USCoreConditionProfile",
        type: "Condition",
        kind: "resource",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Condition",
        derivation: "constraint",
        snapshot: {
          element: [
            { id: "Condition", path: "Condition", min: 0, max: "*", type: [{ code: "Condition" }] },
            { id: "Condition.clinicalStatus", path: "Condition.clinicalStatus", min: 1, max: "1", type: [{ code: "CodeableConcept" }], mustSupport: true },
          ],
        },
      },
    } as any);

    updateResult = await orchestrator.importIG("us-core", bundle as any);

    console.log("\n📦 Update Result (US Core v7.0.0):");
    console.log(`   Resources:       ${updateResult.resourceCount}`);
    console.log(`   SD Indexes:      ${updateResult.sdIndexCount}`);
    console.log(`   Element Indexes: ${updateResult.elementIndexCount}`);
    console.log(`   Concepts:        ${updateResult.conceptCount}`);
    console.log(`   SearchParams:    ${updateResult.spIndexCount}`);
    console.log(`   Errors:          ${updateResult.errors.length}`);

    expect(updateResult.errors).toHaveLength(0);
    expect(updateResult.resourceCount).toBe(10); // 9 + 1 new Condition
    expect(updateResult.sdIndexCount).toBe(4);   // 3 + 1 new
  });

  it("Step 5a: verify updated IG index includes new profile", async () => {
    const repos = orchestrator.repos;
    const index = await repos.resourceMap.getIGIndex("us-core");

    console.log("\n📋 Updated IG Index (us-core v7.0.0):");
    console.log(`   Profiles:         ${index.profiles.length}`);
    console.log(`   Extensions:       ${index.extensions.length}`);
    console.log(`   ValueSets:        ${index.valueSets.length}`);

    // Should now have 3 profiles (Patient, Observation, Condition)
    expect(index.profiles.length).toBe(3);
    const conditionProfile = index.profiles.find((p: any) => p.resourceId === "us-core-condition");
    expect(conditionProfile).toBeDefined();
    expect(conditionProfile!.baseType).toBe("Condition");
  });

  it("Step 5b: verify SD index has updated version", async () => {
    const repos = orchestrator.repos;
    const sd = await repos.sdIndex.getById("us-core-patient");
    expect(sd).toBeDefined();
    // After upsert, the version should be 7.0.0
    expect(sd!.version).toBe("7.0.0");

    // New profile should exist
    const condition = await repos.sdIndex.getById("us-core-condition");
    expect(condition).toBeDefined();
    expect(condition!.type).toBe("Condition");
  });

  it("Step 5c: expansion cache — write and read", async () => {
    const repos = orchestrator.repos;
    const expansionJson = JSON.stringify({
      contains: [
        { system: "http://example.org", code: "M", display: "Male" },
        { system: "http://example.org", code: "F", display: "Female" },
      ],
    });

    await repos.expansionCache.upsert(
      "http://hl7.org/fhir/ValueSet/administrative-gender", "",
      expansionJson, 2,
    );

    const cached = await repos.expansionCache.get(
      "http://hl7.org/fhir/ValueSet/administrative-gender", "",
    );

    expect(cached).toBeDefined();
    expect(cached!.codeCount).toBe(2);
    const parsed = JSON.parse(cached!.expansionJson);
    expect(parsed.contains).toHaveLength(2);

    console.log("\n💾 Expansion Cache: written and verified");
  });
});

// =============================================================================
// PostgreSQL E2E Tests (skipped if PG not configured)
// =============================================================================

const PG_HOST = process.env["DB_HOST"] ?? "localhost";
const PG_PORT = parseInt(process.env["DB_PORT"] ?? "5433", 10);
const PG_DB = process.env["DB_NAME"] ?? "medxai_dev";
const PG_USER = process.env["DB_USER"] ?? "postgres";
const PG_PASS = process.env["DB_PASSWORD"] ?? "assert";

// Check if pg driver is available
let pgAvailable = false;
let Pool: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Pool = require("pg").Pool;
  pgAvailable = true;
} catch {
  pgAvailable = false;
}

const describePG = pgAvailable ? describe : describe.skip;

describePG("IG Persistence E2E — PostgreSQL", () => {
  let adapter: any;
  let pool: any;
  let orchestrator: InstanceType<typeof IGImportOrchestrator>;
  const { PostgresAdapter } = fp;

  const CLEANUP_TABLES = [
    "ig_resource_map", "structure_definition_index", "structure_element_index",
    "value_set_expansion", "code_system_concept", "search_parameter_index",
  ];

  beforeAll(async () => {
    try {
      pool = new Pool({
        host: PG_HOST,
        port: PG_PORT,
        database: PG_DB,
        user: PG_USER,
        password: PG_PASS,
      });
      adapter = new PostgresAdapter(pool);

      // Test connection
      await adapter.execute("SELECT 1");

      // Clean up any previous test data
      for (const t of CLEANUP_TABLES) {
        await adapter.execute(`DROP TABLE IF EXISTS "${t}" CASCADE`);
      }

      orchestrator = new IGImportOrchestrator(adapter, "postgres", {
        extractElementIndex,
        flattenConcepts,
      });
    } catch (err) {
      console.warn(`⚠️ PostgreSQL not available: ${err}`);
      adapter = null;
    }
  });

  afterAll(async () => {
    if (adapter) {
      // Clean up
      for (const t of CLEANUP_TABLES) {
        await adapter.execute(`DROP TABLE IF EXISTS "${t}" CASCADE`);
      }
      await pool.end();
    }
  });

  it("Step 1: initializes all conformance tables (PG)", async () => {
    if (!adapter) return;
    await orchestrator.ensureAllTables();
    const index = await orchestrator.repos.resourceMap.getIGIndex("nonexistent");
    expect(index.profiles).toHaveLength(0);
  });

  it("Step 2: imports US Core v6.1.0 (PG)", async () => {
    if (!adapter) return;
    const bundle = createUSCoreBundle("6.1.0");
    const result = await orchestrator.importIG("us-core", bundle as any);

    console.log("\n📦 [PG] Import Result (US Core v6.1.0):");
    console.log(`   Resources:       ${result.resourceCount}`);
    console.log(`   SD Indexes:      ${result.sdIndexCount}`);
    console.log(`   Element Indexes: ${result.elementIndexCount}`);
    console.log(`   Concepts:        ${result.conceptCount}`);
    console.log(`   SearchParams:    ${result.spIndexCount}`);
    console.log(`   Errors:          ${result.errors.length}`);

    expect(result.errors).toHaveLength(0);
    expect(result.resourceCount).toBe(9);
    expect(result.sdIndexCount).toBe(3);
    expect(result.elementIndexCount).toBeGreaterThan(0);
    expect(result.conceptCount).toBe(4);
    expect(result.spIndexCount).toBe(2);
  });

  it("Step 3: verifies IG index (PG)", async () => {
    if (!adapter) return;
    const index = await orchestrator.repos.resourceMap.getIGIndex("us-core");
    expect(index.profiles.length).toBe(2);
    expect(index.extensions.length).toBe(1);
    expect(index.valueSets.length).toBe(2);
    expect(index.codeSystems.length).toBe(1);
    expect(index.searchParameters.length).toBe(2);
  });

  it("Step 4: updates to v7.0.0 (PG upsert)", async () => {
    if (!adapter) return;
    const bundle = createUSCoreBundle("7.0.0");
    bundle.entry.push({
      resource: {
        resourceType: "StructureDefinition",
        id: "us-core-condition",
        url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition",
        version: "7.0.0",
        name: "USCoreConditionProfile",
        type: "Condition",
        kind: "resource",
        baseDefinition: "http://hl7.org/fhir/StructureDefinition/Condition",
        derivation: "constraint",
        snapshot: {
          element: [
            { id: "Condition", path: "Condition", min: 0, max: "*", type: [{ code: "Condition" }] },
            { id: "Condition.clinicalStatus", path: "Condition.clinicalStatus", min: 1, max: "1", type: [{ code: "CodeableConcept" }], mustSupport: true },
          ],
        },
      },
    } as any);

    const result = await orchestrator.importIG("us-core", bundle as any);

    console.log("\n📦 [PG] Update Result (US Core v7.0.0):");
    console.log(`   Resources:       ${result.resourceCount}`);
    console.log(`   SD Indexes:      ${result.sdIndexCount}`);

    expect(result.errors).toHaveLength(0);
    expect(result.sdIndexCount).toBe(4);
  });

  it("Step 5: verifies updated data (PG)", async () => {
    if (!adapter) return;
    const index = await orchestrator.repos.resourceMap.getIGIndex("us-core");
    expect(index.profiles.length).toBe(3);

    const sd = await orchestrator.repos.sdIndex.getById("us-core-patient");
    expect(sd!.version).toBe("7.0.0");

    const condition = await orchestrator.repos.sdIndex.getById("us-core-condition");
    expect(condition).toBeDefined();
    expect(condition!.type).toBe("Condition");
  });
});
