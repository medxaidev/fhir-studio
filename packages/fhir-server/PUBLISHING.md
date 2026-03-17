# Publishing Checklist for fhir-server v0.1.0

## ⚠️ CRITICAL: Entry Point Issue

**MUST FIX BEFORE PUBLISHING:**

The build script uses `src/index.ts` as entry point, but the new v0.1.0 architecture uses `src/index.new.ts`.

### Fix Required:

**Option 1: Rename index.new.ts to index.ts (RECOMMENDED)**
```bash
cd packages/fhir-server
mv src/index.ts src/index.old.ts
mv src/index.new.ts src/index.ts
```

**Option 2: Update build script**
Edit `scripts/esbuild.mjs` line 26:
```javascript
entryPoints: ['./src/index.new.ts'],  // Changed from './src/index.ts'
```

## Pre-Publication Checklist

### 1. Code Quality
- [x] All tests passing (276+ tests)
- [x] TypeScript strict mode enabled
- [x] Aligned with fhir-engine v0.6.0 API
- [ ] **Fix entry point issue above**
- [ ] Run build: `npm run build`
- [ ] Verify dist/ output exists

### 2. Package Configuration
- [x] package.json version set to 0.1.0
- [x] package.json name: "fhir-server"
- [x] package.json repository URL: nicefhir/fhir-studio
- [x] package.json homepage correct
- [x] License: Apache-2.0
- [x] Files field includes only "dist"
- [x] Exports configured for ESM/CJS
- [x] Dependencies listed correctly

### 3. Documentation
- [x] README.md created
- [x] CHANGELOG.md created
- [x] API.md created
- [x] LICENSE file exists (root)
- [ ] Verify all examples in README work

### 4. Dependencies
Runtime dependencies:
- `fastify` 5.7.4
- `@fastify/cors` ^11.2.0
- `@fastify/helmet` ^13.0.2
- `@fastify/rate-limit` ^10.3.0
- `jose` ^6.1.3
- `fhir-engine` ^0.6.0

**Note:** fhir-engine should be a **peer dependency** since users provide their own engine implementation.

### 5. Build Artifacts
- [ ] Run `npm run clean`
- [ ] Run `npm run build`
- [ ] Verify dist/esm/index.mjs exists
- [ ] Verify dist/cjs/index.cjs exists
- [ ] Verify dist/index.d.ts exists
- [ ] Verify dist/esm/index.d.ts exists
- [ ] Verify dist/cjs/index.d.ts exists

### 6. Package Testing
- [ ] Test local installation:
  ```bash
  npm pack
  # Creates fhir-server-0.1.0.tgz
  ```
- [ ] Inspect package contents:
  ```bash
  tar -tzf fhir-server-0.1.0.tgz
  ```
- [ ] Verify only dist/ files are included
- [ ] Verify config files excluded (fhir.config.json, medxai.config.json)
- [ ] Test in another project:
  ```bash
  npm install /path/to/fhir-server-0.1.0.tgz
  ```

### 7. Integration Testing
Create a minimal test server:

```typescript
import { FhirServer } from 'fhir-server';
import { createMockEngine } from './mock-engine';

const engine = createMockEngine();
const server = new FhirServer({ engine, port: 3000 });

await server.start();
console.log(`Server running at ${server.getAddress()}`);

// Test endpoints
// GET http://localhost:3000/metadata
// POST http://localhost:3000/Patient
// etc.

await server.stop();
```

### 8. npm Registry Preparation
- [ ] Create npm account (if needed): https://www.npmjs.com/signup
- [ ] Login: `npm login`
- [ ] Check package name availability: `npm view fhir-server`
- [ ] Consider scoped package if name taken: `@nicefhir/fhir-server`

### 9. Publishing
- [ ] Dry run: `npm publish --dry-run`
- [ ] Review output carefully
- [ ] Publish: `npm publish`
- [ ] Verify on npm: https://www.npmjs.com/package/fhir-server

### 10. Post-Publication
- [ ] Test installation: `npm install fhir-server`
- [ ] Create git tag: `git tag fhir-server-v0.1.0`
- [ ] Push tag: `git push origin fhir-server-v0.1.0`
- [ ] Create GitHub release with CHANGELOG content
- [ ] Update project README to link to npm package

## Build Commands

```bash
# Clean previous builds
npm run clean

# Run tests
npm test

# Build package
npm run build

# Pack for testing
npm pack

# Publish (after all checks)
npm publish
```

## Verification After Publishing

```bash
# Install in test project
mkdir test-fhir-server
cd test-fhir-server
npm init -y
npm install fhir-server fhir-engine

# Test ESM import
node --input-type=module -e "import { FhirServer } from 'fhir-server'; console.log(FhirServer);"

# Test CJS require
node -e "const { FhirServer } = require('fhir-server'); console.log(FhirServer);"
```

## Important Notes

### fhir-engine Dependency

The package currently lists `fhir-engine` as a regular dependency. Consider if it should be:

1. **Peer dependency** (RECOMMENDED): Users provide their own engine
   ```json
   "peerDependencies": {
     "fhir-engine": "^0.6.0"
   }
   ```

2. **Regular dependency**: Package includes engine (current setup)

### Old Code Cleanup

The package contains old architecture code that is not used:
- `src/auth/` (old auth, conflicts with `src/auth-v2/`)
- Old monolithic files

**Options:**
1. Keep for reference (current - safe for v0.1.0)
2. Remove before publishing (risky - could break something)
3. Remove in v0.1.1 after v0.1.0 is validated

**Recommendation:** Keep old code for v0.1.0, remove in v0.1.1

## Rollback Plan

If issues are discovered after publishing:

1. **Deprecate the version:**
   ```bash
   npm deprecate fhir-server@0.1.0 "Critical bug, use 0.1.1 instead"
   ```

2. **Publish fixed version:**
   ```bash
   # Fix issues
   # Update version to 0.1.1
   npm publish
   ```

3. **Cannot unpublish after 72 hours** - only deprecate is available

## Known Limitations (Documented in CHANGELOG)

Deferred to v0.2.0:
- WebSocket subscription endpoint (SUB-02)
- FhirEnginePlugin system (SRV-02)
- OAuth2 token and login routes (AUTH-03/04)
- Full terminology service implementation
- Transaction bundle processing (returns 501)
- Conditional CRUD operations
- Advanced search features

## Security Considerations

- [ ] JWT secret must be provided by users (not hardcoded)
- [ ] HTTPS recommended for production
- [ ] Rate limiting enabled by default
- [ ] Security headers enabled via Helmet
- [ ] CORS configured appropriately
