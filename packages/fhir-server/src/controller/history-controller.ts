/**
 * History Controller
 *
 * Handles FHIR history operations.
 * Builds a FHIR history Bundle from engine.persistence.readHistory().
 *
 * @module fhir-server/controller
 */

import type { FastifyReply } from "fastify";
import type { FhirEngine } from "../types/engine.js";
import type { Bundle, BundleEntry } from "../types/fhir.js";
import { FHIR_JSON, buildETag, buildLastModified } from "../error/response.js";
import { errorToOutcome } from "../error/outcomes.js";

// =============================================================================
// History Instance
// =============================================================================

/**
 * GET /:resourceType/:id/_history → Instance history.
 */
export async function handleHistoryInstance(
  engine: FhirEngine,
  baseUrl: string,
  resourceType: string,
  id: string,
  reply: FastifyReply,
): Promise<void> {
  try {
    const entries = await engine.persistence.readHistory(resourceType, id);
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

    const bundleEntries: BundleEntry[] = entries.map((entry) => {
      const be: BundleEntry = {
        fullUrl: `${base}/${entry.resourceType}/${entry.id}`,
      };

      if (entry.deleted) {
        be.request = {
          method: "DELETE",
          url: `${entry.resourceType}/${entry.id}`,
        };
        be.response = {
          status: "204",
          etag: buildETag(entry.versionId),
          lastModified: buildLastModified(entry.lastUpdated),
        };
      } else if (entry.resource) {
        be.resource = entry.resource;
        be.request = {
          method: "PUT",
          url: `${entry.resourceType}/${entry.id}`,
        };
        be.response = {
          status: "200",
          etag: buildETag(entry.versionId),
          lastModified: buildLastModified(entry.lastUpdated),
        };
      }

      return be;
    });

    const bundle: Bundle = {
      resourceType: "Bundle",
      type: "history",
      total: entries.length,
      link: [
        { relation: "self", url: `${base}/${resourceType}/${id}/_history` },
      ],
      entry: bundleEntries,
    };

    reply.status(200).header("content-type", FHIR_JSON).send(bundle);
  } catch (err) {
    const { status, outcome } = errorToOutcome(err);
    reply.status(status).header("content-type", FHIR_JSON).send(outcome);
  }
}
