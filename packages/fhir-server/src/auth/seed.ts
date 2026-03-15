/**
 * Database Seed
 *
 * Creates initial platform resources required for the system to function:
 * 1. Project (Super Admin, superAdmin=true)
 * 2. User (admin account with bcrypt password hash)
 * 3. ClientApplication (default OAuth2 client)
 * 4. ProjectMembership (admin → project, admin=true)
 * 5. ProjectMembership (client → project)
 *
 * JsonWebKey is handled separately by `initKeys()`.
 *
 * @module fhir-server/auth
 */

import type { ResourceRepository, PersistedResource } from "@medxai/fhir-persistence";
import { hash } from "bcryptjs";
import { generateSecret } from "./keys.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/** Configuration for database seeding. */
export interface SeedConfig {
  /** Admin user email. */
  adminEmail: string;
  /** Admin user password (will be bcrypt-hashed). */
  adminPassword: string;
  /** Optional: fixed client ID for the default ClientApplication. */
  clientId?: string;
  /** Optional: fixed client secret. If not provided, one is generated. */
  clientSecret?: string;
}

/** Result of the seed operation. */
export interface SeedResult {
  project: PersistedResource;
  user: PersistedResource;
  client: PersistedResource;
  adminMembership: PersistedResource;
  clientMembership: PersistedResource;
  clientSecret: string;
}

// =============================================================================
// Section 2: Seed Function
// =============================================================================

/**
 * Seed the database with initial platform resources.
 *
 * This is idempotent-ish: it searches for existing resources first
 * and only creates what's missing. However, for a clean setup,
 * it's recommended to run on a fresh database.
 *
 * @param repo - A system-level repository (no project/AccessPolicy restrictions).
 * @param config - Seed configuration.
 * @returns The created resources and generated client secret.
 */
export async function seedDatabase(
  repo: ResourceRepository,
  config: SeedConfig,
): Promise<SeedResult> {
  const BCRYPT_ROUNDS = 10;

  // 1. Create Project
  const project = await repo.createResource({
    resourceType: "Project",
    name: "Super Admin",
    description: "System administration project",
    superAdmin: true,
  } as any);

  // 2. Create User
  const passwordHash = await hash(config.adminPassword, BCRYPT_ROUNDS);
  const user = await repo.createResource({
    resourceType: "User",
    firstName: "Admin",
    lastName: "User",
    email: config.adminEmail,
    emailVerified: true,
    passwordHash,
    project: { reference: `Project/${project.id}` },
  } as any);

  // 3. Create ClientApplication
  const clientSecret = config.clientSecret ?? generateSecret(32);
  const client = await repo.createResource({
    resourceType: "ClientApplication",
    name: "Default Client",
    description: "Default OAuth2 client application",
    status: "active",
    secret: clientSecret,
  } as any, config.clientId ? { assignedId: config.clientId } : undefined);

  // 4. Create ProjectMembership (admin user → project)
  const adminMembership = await repo.createResource({
    resourceType: "ProjectMembership",
    project: { reference: `Project/${project.id}` },
    user: { reference: `User/${user.id}` },
    profile: { reference: `User/${user.id}` },
    admin: true,
    active: true,
    userName: config.adminEmail,
  } as any);

  // 5. Create ProjectMembership (client → project)
  const clientMembership = await repo.createResource({
    resourceType: "ProjectMembership",
    project: { reference: `Project/${project.id}` },
    user: { reference: `ClientApplication/${client.id}` },
    profile: { reference: `ClientApplication/${client.id}` },
    admin: false,
    active: true,
    userName: "Default Client",
  } as any);

  return {
    project,
    user,
    client,
    adminMembership,
    clientMembership,
    clientSecret,
  };
}
