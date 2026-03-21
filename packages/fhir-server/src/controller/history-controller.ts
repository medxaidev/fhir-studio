/**
 * History Controller
 *
 * Handles FHIR history operations.
 * Builds a FHIR history Bundle from engine.persistence.readHistory().
 *
 * @module fhir-server/controller
 */

import type { FastifyReply, FastifyRequest } from "fastify";
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
  request?: FastifyRequest,
): Promise<void> {
  try {
    const allEntries = await engine.persistence.readHistory(resourceType, id);
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

    // FIX-9: Support _count and _since query parameters
    const query = (request?.query ?? {}) as Record<string, string | undefined>;
    const countParam = query._count ? parseInt(query._count, 10) : undefined;
    const sinceParam = query._since;

    let entries = allEntries;
    if (sinceParam) {
      const sinceDate = new Date(sinceParam).getTime();
      entries = entries.filter((e) => new Date(e.lastUpdated).getTime() >= sinceDate);
    }
    if (countParam !== undefined && countParam > 0) {
      entries = entries.slice(0, countParam);
    }

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
