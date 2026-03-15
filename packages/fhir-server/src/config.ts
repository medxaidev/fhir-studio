/**
 * Server Configuration Loader
 *
 * Reads `medxai.config.json` from the server package root and merges
 * with environment variable overrides.
 *
 * Priority (highest → lowest):
 * 1. Environment variables (e.g. DB_HOST, PORT)
 * 2. Config file values
 * 3. Built-in defaults
 *
 * @module fhir-server/config
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// =============================================================================
// Section 1: Types
// =============================================================================

export interface DatabaseConfig {
  host: string;
  port: number;
  dbname: string;
  username: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
  enabled: boolean;
}

export interface SeedConfig {
  adminEmail: string;
  adminPassword: string;
  skipConformance: boolean;
}

export interface MedXAIServerConfig {
  port: number;
  baseUrl: string;
  consoleUrl: string;
  allowedOrigins: string;
  maxJsonSize: string;
  maxBatchSize: string;
  bodyLimit: number;
  logger: boolean;
  enableAuth: boolean;
  database: DatabaseConfig;
  redis: RedisConfig;
  seed: SeedConfig;
  shutdownTimeoutMilliseconds: number;
}

// =============================================================================
// Section 2: Defaults
// =============================================================================

const DEFAULTS: MedXAIServerConfig = {
  port: 8080,
  baseUrl: "http://localhost:8080/",
  consoleUrl: "http://localhost:3001/",
  allowedOrigins: "*",
  maxJsonSize: "1mb",
  maxBatchSize: "50mb",
  bodyLimit: 16_777_216,
  logger: false,
  enableAuth: true,
  database: {
    host: "localhost",
    port: 5433,
    dbname: "medxai_dev",
    username: "postgres",
    password: "assert",
  },
  redis: {
    host: "localhost",
    port: 6379,
    password: "",
    db: 0,
    enabled: false,
  },
  seed: {
    adminEmail: "admin@medxai.test",
    adminPassword: "medxai123",
    skipConformance: false,
  },
  shutdownTimeoutMilliseconds: 30_000,
};

// =============================================================================
// Section 3: Loader
// =============================================================================

/**
 * Load server configuration from `medxai.config.json` in the given directory,
 * with environment variable overrides.
 *
 * @param configDir - Directory containing `medxai.config.json`.
 *                    Defaults to the fhir-server package root.
 * @returns Fully resolved configuration.
 */
export function loadConfig(configDir?: string): MedXAIServerConfig {
  const dir = configDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const configPath = resolve(dir, "medxai.config.json");

  let fileConfig: Partial<MedXAIServerConfig> = {};

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(raw);
    } catch (err) {
      console.warn(`[Config] ⚠️  Failed to parse ${configPath}: ${(err as Error).message}`);
    }
  } else {
    console.warn(`[Config] ⚠️  ${configPath} not found — using defaults`);
  }

  // Merge: defaults ← file ← env overrides
  const config: MedXAIServerConfig = {
    ...DEFAULTS,
    ...fileConfig,
    database: {
      ...DEFAULTS.database,
      ...(fileConfig.database ?? {}),
    },
    redis: {
      ...DEFAULTS.redis,
      ...(fileConfig.redis ?? {}),
    },
    seed: {
      ...DEFAULTS.seed,
      ...(fileConfig.seed ?? {}),
    },
  };

  // Environment variable overrides
  applyEnvOverrides(config);

  return config;
}

/**
 * Apply environment variable overrides to the config.
 * Env vars take highest priority.
 */
function applyEnvOverrides(config: MedXAIServerConfig): void {
  const env = process.env;

  // Server
  if (env["PORT"]) config.port = parseInt(env["PORT"], 10);
  if (env["BASE_URL"]) config.baseUrl = env["BASE_URL"];
  if (env["CONSOLE_URL"]) config.consoleUrl = env["CONSOLE_URL"];
  if (env["ALLOWED_ORIGINS"]) config.allowedOrigins = env["ALLOWED_ORIGINS"];
  if (env["LOGGER"]) config.logger = env["LOGGER"] === "true" || env["LOGGER"] === "1";
  if (env["ENABLE_AUTH"]) config.enableAuth = env["ENABLE_AUTH"] !== "false" && env["ENABLE_AUTH"] !== "0";
  if (env["BODY_LIMIT"]) config.bodyLimit = parseInt(env["BODY_LIMIT"], 10);

  // Database
  if (env["DB_HOST"]) config.database.host = env["DB_HOST"];
  if (env["DB_PORT"]) config.database.port = parseInt(env["DB_PORT"], 10);
  if (env["DB_NAME"]) config.database.dbname = env["DB_NAME"];
  if (env["DB_USER"]) config.database.username = env["DB_USER"];
  if (env["DB_PASSWORD"]) config.database.password = env["DB_PASSWORD"];

  // Redis
  if (env["REDIS_HOST"]) config.redis.host = env["REDIS_HOST"];
  if (env["REDIS_PORT"]) config.redis.port = parseInt(env["REDIS_PORT"], 10);
  if (env["REDIS_PASSWORD"]) config.redis.password = env["REDIS_PASSWORD"];
  if (env["REDIS_DB"]) config.redis.db = parseInt(env["REDIS_DB"], 10);
  if (env["REDIS_ENABLED"]) config.redis.enabled = env["REDIS_ENABLED"] === "true" || env["REDIS_ENABLED"] === "1";

  // Seed
  if (env["ADMIN_EMAIL"]) config.seed.adminEmail = env["ADMIN_EMAIL"];
  if (env["ADMIN_PASSWORD"]) config.seed.adminPassword = env["ADMIN_PASSWORD"];
  if (env["SKIP_CONFORMANCE"]) config.seed.skipConformance = env["SKIP_CONFORMANCE"] === "1" || env["SKIP_CONFORMANCE"] === "true";

  // Recalculate baseUrl if port was overridden but baseUrl wasn't
  if (env["PORT"] && !env["BASE_URL"]) {
    config.baseUrl = `http://localhost:${config.port}/`;
  }
}
