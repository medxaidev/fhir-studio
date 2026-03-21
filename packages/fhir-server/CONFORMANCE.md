# FHIR Server Conformance Report

**Date:** 2026-03-20  
**Server:** MedXAI FHIR Server (fhir-server)  
**FHIR Version:** 4.0.1 (R4)  
**Test Suite:** `scripts/conformance-test.mts`

## Overall Score

| Metric | Value |
|--------|-------|
| **Weighted Score** | **93.9%** |
| Total Tests | 132 |
| Pass | 100 |
| Partial | 2 |
| Fail | 5 |
| N/A | 25 |

## Category Breakdown

| Category | Total | Pass | Partial | Fail | N/A | Rate |
|----------|-------|------|---------|------|-----|------|
| Protocol Compliance | 12 | 11 | 1 | 0 | 0 | 95.8% |
| Core CRUD & Search | 48 | 45 | 0 | 2 | 1 | 95.7% |
| Advanced REST | 27 | 17 | 0 | 2 | 8 | 89.5% |
| Semantic Compliance | 12 | 10 | 1 | 0 | 1 | 95.5% |
| Capability Consistency | 7 | 6 | 0 | 0 | 1 | 100.0% |
| Terminology & Validation | 17 | 5 | 0 | 1 | 11 | 83.3% |
| Conformance Resources | 9 | 6 | 0 | 0 | 3 | 100.0% |

## Remaining Failures

These 5 failures are in the underlying `fhir-engine` / `fhir-runtime` packages and cannot be fixed at the server layer:

| Test | Description | Cause |
|------|-------------|-------|
| U-02 | Update as Create (upsert) | `fhir-persistence` does not support PUT-as-create |
| ST-02 | String `:exact` modifier | Engine does not match `:exact` against individual name components |
| CC-02 | Conditional Create with match | Engine creates duplicate instead of returning existing resource |
| B-02 | Transaction bundle | Intentionally returns 501 (not yet implemented) |
| V-02 | `$validate` unknown property | `fhir-runtime` validator does not detect unknown properties |

## Fixes Applied (2026-03-20)

### 1. Rate Limiter Cascade (53.8% → ~80%)
**Root cause:** Default rate limit of 100 req/min was hit during conformance tests, causing a cascade of 500 errors.  
**Fix:** Disabled rate limiter in dev mode (`fhir.config.json` + `dev.ts`).

### 2. handleUpdate Validation (~80% → ~87%)
**Root cause:** Missing `resourceType` requirement and `id` mismatch check in PUT handler allowed test U-04 to silently overwrite patient data, causing downstream name search failures.  
**Fix:** Added `body.resourceType` required check + `body.id` mismatch check in `crud-controller.ts`.

### 3. Resource Type Validation (C-05/CC-11)
**Root cause:** Unknown resource types reached the persistence layer and threw unhandled errors (500).  
**Fix:** Added `validateResourceType()` helper in `fhir-router.ts` applied to all `/:resourceType` routes → returns 404.

### 4. JSON Parse Error Mapping (C-07)
**Root cause:** `SyntaxError` from malformed JSON bodies mapped to 500 via generic error path.  
**Fix:** Added `SyntaxError` detection in `errorToOutcome()` → returns 400.

### 5. Unknown Search Parameter (CC-31)
**Root cause:** Engine throws "Unknown search parameter" which mapped to 500.  
**Fix:** Caught in `search-controller.ts` → returns 400 with `code: "not-supported"`.

### 6. ValueSet $expand by ID (T-02)
**Root cause:** Only `GET /ValueSet/$expand?url=...` was supported, not `GET /ValueSet/:id/$expand`.  
**Fix:** Added route + `handleValueSetExpandById()` in `operation-controller.ts`.

### 7. Test Data Restoration (CC-30/CR-04)
**Root cause:** SC tests modified the seed patient's name but didn't restore it.  
**Fix:** Added patient restoration at end of Level 3 tests in `conformance-test.mts`.

## Running the Test

```bash
# Start server with clean database
cd packages/fhir-server
rm -f data/fhir.db*
npx tsx scripts/dev.ts

# In another terminal
npx tsx scripts/conformance-test.mts
```

## Future Improvements

To reach higher conformance, the following would need changes in `fhir-engine` / `fhir-runtime`:

- **Transaction support** — atomic bundle processing with rollback
- **Conditional CRUD** — If-None-Exist on create, conditional update/delete
- **Chained search** — `subject.name=X` style parameters
- **PUT-as-create** — upsert semantics for new resource IDs
- **String :exact** — case-sensitive exact match on individual name components
- **Deep validation** — unknown property detection in `$validate`
