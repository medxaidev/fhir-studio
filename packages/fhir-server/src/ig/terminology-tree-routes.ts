/**
 * Terminology Tree Routes (Task 4.5)
 *
 * Provides CodeSystem hierarchy API under the `/_terminology/` prefix:
 * - GET /_terminology/codesystem/:id/tree — CodeSystem concept tree
 *
 * Data access goes through engine.conformance.getConceptTree().
 *
 * @module fhir-server/ig
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FhirEngine, ConceptHierarchyEntry } from "../types/engine.js";
import { FHIR_JSON } from "../error/response.js";
import { errorToOutcome, badRequest } from "../error/outcomes.js";

// =============================================================================
// Section 1: Types
// =============================================================================

interface TreeParams {
  id: string;
}

interface TreeNode {
  code: string;
  display?: string;
  children: TreeNode[];
}

export interface TerminologyTreeRouterOptions {
  engine: FhirEngine;
}

// =============================================================================
// Section 2: Tree Builder
// =============================================================================

/**
 * Build a nested tree structure from flat concept entries.
 */
function buildTree(entries: ConceptHierarchyEntry[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create all nodes
  for (const e of entries) {
    nodeMap.set(e.code, { code: e.code, display: e.display, children: [] });
  }

  // Wire parent-child relationships
  for (const e of entries) {
    const node = nodeMap.get(e.code)!;
    if (e.parentCode && nodeMap.has(e.parentCode)) {
      nodeMap.get(e.parentCode)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// =============================================================================
// Section 3: Route Registration
// =============================================================================

export async function terminologyTreeRoutes(
  app: FastifyInstance,
  options: TerminologyTreeRouterOptions,
): Promise<void> {
  const { engine } = options;

  // ── GET /_terminology/codesystem/:id/tree ─────────────────────────────────
  app.get("/codesystem/:id/tree", async (
    request: FastifyRequest<{ Params: TreeParams }>,
    reply: FastifyReply,
  ) => {
    try {
      const conformance = engine.conformance;
      if (!conformance?.getConceptTree) {
        reply.status(501).header("content-type", FHIR_JSON).send(
          badRequest("Conformance module or concept tree not available"),
        );
        return;
      }

      const { id } = request.params;

      // Try to find the CodeSystem to get its URL
      let codeSystemUrl: string;
      try {
        const cs = await engine.persistence.readResource("CodeSystem", id);
        codeSystemUrl = (cs as Record<string, unknown>).url as string;
        if (!codeSystemUrl) {
          reply.status(400).header("content-type", FHIR_JSON).send(
            badRequest(`CodeSystem/${id} has no url field`),
          );
          return;
        }
      } catch {
        // If not found by ID, treat the param as the URL itself
        codeSystemUrl = id;
      }

      const entries = await conformance.getConceptTree(codeSystemUrl);
      if (entries.length === 0) {
        reply.status(200).header("content-type", "application/json").send({
          codeSystemUrl,
          nodes: [],
        });
        return;
      }

      const nodes = buildTree(entries);

      reply.status(200).header("content-type", "application/json").send({
        codeSystemUrl,
        totalConcepts: entries.length,
        nodes,
      });
    } catch (err) {
      const { status, outcome } = errorToOutcome(err);
      reply.status(status).header("content-type", FHIR_JSON).send(outcome);
    }
  });
}
