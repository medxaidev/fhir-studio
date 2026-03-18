/**
 * IG Module — Barrel Export
 *
 * Phase 004: IG & Terminology API Layer
 *
 * @module fhir-server/ig
 */

export { igRoutes } from "./ig-routes.js";
export type { IGRouterOptions } from "./ig-routes.js";

export { adminIGRoutes } from "./admin-ig-routes.js";
export type { AdminIGRouterOptions } from "./admin-ig-routes.js";

export { terminologyTreeRoutes } from "./terminology-tree-routes.js";
export type { TerminologyTreeRouterOptions } from "./terminology-tree-routes.js";
