/**
 * Dev Server Bootstrap (v0.1.0 Architecture)
 *
 * Starts fhir-server using fhir-engine as the backend.
 * Follows the same config-loading pattern as fhir-cli:
 *   loadFhirConfig() → createFhirEngine() → engine.status()
 *
 * Config file: fhir.config.json (project root)
 *
 * Usage:
 *   npx tsx scripts/dev.ts
 *   npx tsx watch scripts/dev.ts
 *   npx tsx scripts/dev.ts --config path/to/fhir.config.json
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadFhirConfig, createFhirEngine } from "fhir-engine";
import type { FhirEngine } from "fhir-engine";
import { FhirServer } from "../src/server/fhir-server.js";
import { createPackageConformance } from "../src/ig/package-conformance.js";
import type { EngineDefinitions } from "../src/ig/package-conformance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

/**
 * Find config file path from --config arg or default location.
 */
function resolveConfigPath(): string {
  // Check for --config flag
  const idx = process.argv.indexOf("--config");
  if (idx !== -1 && process.argv[idx + 1]) {
    const p = resolve(process.argv[idx + 1]);
    if (!existsSync(p)) {
      console.error(`Config file not found: ${p}`);
      process.exit(1);
    }
    return p;
  }

  // Default: fhir.config.json in project root (one level up from scripts/)
  const defaultPath = resolve(__dirname, "..", "fhir.config.json");
  if (!existsSync(defaultPath)) {
    console.error(`Config file not found: ${defaultPath}`);
    console.error("Create a fhir.config.json in the fhir-server package root.");
    process.exit(1);
  }
  return defaultPath;
}

async function main() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║     FHIR Server v0.1.0 — Dev Mode        ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log();

  // 1. Load config (fhir-cli pattern: loadFhirConfig → createFhirEngine)
  const configPath = resolveConfigPath();
  console.log(`[Config] ${configPath}`);

  const config = await loadFhirConfig(configPath);

  // 2. Bootstrap fhir-engine
  console.log("[Engine] Initializing fhir-engine...");
  const engine: FhirEngine = await createFhirEngine(config);

  // 2b. Wire up PackageConformance (reads IG data from in-memory definitions)
  const rawDefs = (engine as unknown as Record<string, unknown>).definitions;
  if (rawDefs && typeof rawDefs === "object" && "sdByUrl" in (rawDefs as object)) {
    (engine as unknown as Record<string, unknown>).conformance =
      createPackageConformance(rawDefs as EngineDefinitions);
    console.log("[Engine] PackageConformance wired (in-memory definitions)");
  }

  // 3. Display engine status (fhir-cli pattern: engine.status())
  const status = engine.status();
  console.log("[Engine] ✅ Ready");
  console.log(`  Database: ${status.databaseType}`);
  console.log(`  FHIR version: ${status.fhirVersions.join(", ")}`);
  console.log(`  Resource types: ${status.resourceTypes.length}`);
  console.log(`  IG action: ${status.igAction}`);
  if (status.loadedPackages.length > 0) {
    console.log(`  Loaded packages:`);
    for (const pkg of status.loadedPackages) {
      console.log(`    - ${pkg}`);
    }
  }
  console.log();

  // 4. Create and start FhirServer
  const server = new FhirServer({
    engine: engine as any,
    port: PORT,
    host: HOST,
    baseUrl: `http://localhost:${PORT}`,
    logger: false,
  });

  console.log(`[Server] Starting on ${HOST}:${PORT}...`);
  await server.start();

  console.log();
  console.log("╔═══════════════════════════════════════════╗");
  console.log(`║  FHIR Server running at http://localhost:${PORT}`);
  console.log("╚═══════════════════════════════════════════╝");
  console.log();
  console.log("Press Ctrl+C to stop.");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[Server] Stopping...");
    await server.stop();
    console.log("[Engine] Stopping...");
    await engine.stop();
    console.log("Bye.");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
