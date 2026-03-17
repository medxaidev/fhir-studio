# Publishing Checklist for fhir-client v0.1.0

## ⚠️ CRITICAL: Entry Point Issue

**MUST FIX BEFORE PUBLISHING:**

The build script uses `src/index.ts` as entry point, but the new v0.1.0 architecture uses `src/index.new.ts`.

### Fix Required:

**Option 1: Rename index.new.ts to index.ts (RECOMMENDED)**
```bash
cd packages/fhir-client
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
- [x] All tests passing (102 tests)
- [x] Zero runtime dependencies
- [x] TypeScript strict mode enabled
- [ ] **Fix entry point issue above**
- [ ] Run build: `npm run build`
- [ ] Verify dist/ output exists

### 2. Package Configuration
- [x] package.json version set to 0.1.0
- [x] package.json name: "fhir-client"
- [x] package.json repository URL correct
- [x] package.json homepage correct
- [x] License: Apache-2.0
- [x] Files field includes only "dist"
- [x] Exports configured for ESM/CJS

### 3. Documentation
- [x] README.md created
- [x] CHANGELOG.md created
- [x] API.md created
- [x] LICENSE file exists (root)
- [ ] Verify all examples in README work

### 4. Build Artifacts
- [ ] Run `npm run clean`
- [ ] Run `npm run build`
- [ ] Verify dist/esm/index.mjs exists
- [ ] Verify dist/cjs/index.cjs exists
- [ ] Verify dist/index.d.ts exists
- [ ] Verify dist/esm/index.d.ts exists
- [ ] Verify dist/cjs/index.d.ts exists

### 5. Package Testing
- [ ] Test local installation:
  ```bash
  npm pack
  # Creates fhir-client-0.1.0.tgz
  ```
- [ ] Inspect package contents:
  ```bash
  tar -tzf fhir-client-0.1.0.tgz
  ```
- [ ] Verify only dist/ files are included
- [ ] Test in another project:
  ```bash
  npm install /path/to/fhir-client-0.1.0.tgz
  ```

### 6. npm Registry Preparation
- [ ] Create npm account (if needed): https://www.npmjs.com/signup
- [ ] Login: `npm login`
- [ ] Check package name availability: `npm view fhir-client`
- [ ] Consider scoped package if name taken: `@nicefhir/fhir-client`

### 7. Publishing
- [ ] Dry run: `npm publish --dry-run`
- [ ] Review output carefully
- [ ] Publish: `npm publish`
- [ ] Verify on npm: https://www.npmjs.com/package/fhir-client

### 8. Post-Publication
- [ ] Test installation: `npm install fhir-client`
- [ ] Create git tag: `git tag fhir-client-v0.1.0`
- [ ] Push tag: `git push origin fhir-client-v0.1.0`
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
mkdir test-fhir-client
cd test-fhir-client
npm init -y
npm install fhir-client

# Test ESM import
node --input-type=module -e "import { FhirClient } from 'fhir-client'; console.log(FhirClient);"

# Test CJS require
node -e "const { FhirClient } = require('fhir-client'); console.log(FhirClient);"
```

## Rollback Plan

If issues are discovered after publishing:

1. **Deprecate the version:**
   ```bash
   npm deprecate fhir-client@0.1.0 "Critical bug, use 0.1.1 instead"
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
- WebSocket subscription tests
- Conditional CRUD operations
- Advanced search features
- Resource builder utilities
- GraphQL support
