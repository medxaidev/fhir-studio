/**
 * Terminology Operation Routes
 *
 * Registers FHIR terminology endpoints:
 * - ValueSet/$expand
 * - CodeSystem/$validate-code
 * - CodeSystem/$lookup
 *
 * @module fhir-server/terminology
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ResourceRepository } from "@medxai/fhir-persistence";
import { TerminologyService, TerminologyError } from "./terminology-service.js";
import type { ExpandOptions } from "./terminology-service.js";
import { FHIR_JSON } from "../fhir/response.js";
import { badRequest } from "../fhir/outcomes.js";

// =============================================================================
// Section 1: Route Parameter Types
// =============================================================================

interface IdParams {
  id: string;
}

// =============================================================================
// Section 2: Route Registration
// =============================================================================

export async function terminologyRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = (fastify as any).repo as ResourceRepository;
  const svc = new TerminologyService(repo);

  // ── ValueSet/$expand ─────────────────────────────────────────────────────

  // POST /ValueSet/$expand (by url parameter or POST body)
  fastify.post("/ValueSet/$expand", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const query = request.query as Record<string, string>;

    // Extract params from Parameters resource or query
    const url = extractParam(body, query, "url", "valueUri");
    const opts = extractExpandOptions(body, query);

    if (!url) {
      return sendOutcome(reply, 400, badRequest("Parameter 'url' is required for $expand"));
    }

    try {
      const result = await svc.expandByUrl(url, opts);
      reply.header("content-type", FHIR_JSON);
      return toExpandParameters(result);
    } catch (err) {
      return handleTermError(reply, err);
    }
  });

  // GET /ValueSet/:id/$expand
  fastify.get<{ Params: IdParams }>(
    "/ValueSet/:id/$expand",
    async (request, reply) => {
      const { id } = request.params;
      const query = request.query as Record<string, string>;
      const opts = extractExpandOptions(undefined, query);

      try {
        const result = await svc.expandById(id, opts);
        reply.header("content-type", FHIR_JSON);
        return toExpandParameters(result);
      } catch (err) {
        return handleTermError(reply, err);
      }
    },
  );

  // ── CodeSystem/$validate-code ────────────────────────────────────────────

  // POST /CodeSystem/$validate-code
  fastify.post("/CodeSystem/$validate-code", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const query = request.query as Record<string, string>;

    const url = extractParam(body, query, "url", "valueUri");
    const code = extractParam(body, query, "code", "valueCode");
    const system = extractParam(body, query, "system", "valueUri");

    if (!code) {
      return sendOutcome(reply, 400, badRequest("Parameter 'code' is required for $validate-code"));
    }

    try {
      let result;
      if (url) {
        result = await svc.validateCodeByUrl(url, code);
      } else if (system) {
        result = await svc.validateCodeByUrl(system, code);
      } else {
        return sendOutcome(reply, 400, badRequest("Parameter 'url' or 'system' is required"));
      }
      reply.header("content-type", FHIR_JSON);
      return toValidateCodeParameters(result);
    } catch (err) {
      return handleTermError(reply, err);
    }
  });

  // GET /CodeSystem/:id/$validate-code
  fastify.get<{ Params: IdParams }>(
    "/CodeSystem/:id/$validate-code",
    async (request, reply) => {
      const { id } = request.params;
      const code = (request.query as any)?.code;

      if (!code) {
        return sendOutcome(reply, 400, badRequest("Query parameter 'code' is required"));
      }

      try {
        const result = await svc.validateCodeById(id, code);
        reply.header("content-type", FHIR_JSON);
        return toValidateCodeParameters(result);
      } catch (err) {
        return handleTermError(reply, err);
      }
    },
  );

  // ── CodeSystem/$lookup ───────────────────────────────────────────────────

  // POST /CodeSystem/$lookup
  fastify.post("/CodeSystem/$lookup", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const query = request.query as Record<string, string>;

    const system = extractParam(body, query, "system", "valueUri");
    const code = extractParam(body, query, "code", "valueCode");

    if (!code) {
      return sendOutcome(reply, 400, badRequest("Parameter 'code' is required for $lookup"));
    }
    if (!system) {
      return sendOutcome(reply, 400, badRequest("Parameter 'system' is required for $lookup"));
    }

    try {
      const result = await svc.lookupByUrl(system, code);
      reply.header("content-type", FHIR_JSON);
      return toLookupParameters(result);
    } catch (err) {
      return handleTermError(reply, err);
    }
  });

  // GET /CodeSystem/:id/$lookup
  fastify.get<{ Params: IdParams }>(
    "/CodeSystem/:id/$lookup",
    async (request, reply) => {
      const { id } = request.params;
      const code = (request.query as any)?.code;

      if (!code) {
        return sendOutcome(reply, 400, badRequest("Query parameter 'code' is required"));
      }

      try {
        const result = await svc.lookupById(id, code);
        reply.header("content-type", FHIR_JSON);
        return toLookupParameters(result);
      } catch (err) {
        return handleTermError(reply, err);
      }
    },
  );

  // ── CodeSystem/$subsumes ──────────────────────────────────────────────────

  // POST /CodeSystem/$subsumes
  fastify.post("/CodeSystem/$subsumes", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const query = request.query as Record<string, string>;

    const system = extractParam(body, query, "system", "valueUri");
    const codeA = extractParam(body, query, "codeA", "valueCode");
    const codeB = extractParam(body, query, "codeB", "valueCode");

    if (!codeA || !codeB) {
      return sendOutcome(reply, 400, badRequest("Parameters 'codeA' and 'codeB' are required"));
    }
    if (!system) {
      return sendOutcome(reply, 400, badRequest("Parameter 'system' is required"));
    }

    try {
      const result = await svc.subsumes(system, codeA, codeB);
      reply.header("content-type", FHIR_JSON);
      return {
        resourceType: "Parameters",
        parameter: [{ name: "outcome", valueCode: result.outcome }],
      };
    } catch (err) {
      return handleTermError(reply, err);
    }
  });

  // GET /CodeSystem/:id/$subsumes
  fastify.get<{ Params: IdParams }>(
    "/CodeSystem/:id/$subsumes",
    async (request, reply) => {
      const { id } = request.params;
      const query = request.query as Record<string, string>;
      const codeA = query?.codeA;
      const codeB = query?.codeB;

      if (!codeA || !codeB) {
        return sendOutcome(reply, 400, badRequest("Query parameters 'codeA' and 'codeB' are required"));
      }

      try {
        const result = await svc.subsumesById(id, codeA, codeB);
        reply.header("content-type", FHIR_JSON);
        return {
          resourceType: "Parameters",
          parameter: [{ name: "outcome", valueCode: result.outcome }],
        };
      } catch (err) {
        return handleTermError(reply, err);
      }
    },
  );
}

// =============================================================================
// Section 3: Parameter Extraction
// =============================================================================

function extractParam(
  body: Record<string, unknown> | undefined,
  query: Record<string, string>,
  name: string,
  valueKey: string,
): string | undefined {
  // From Parameters resource body
  const fromBody = (body as any)?.parameter?.find?.((p: any) => p.name === name)?.[valueKey];
  if (fromBody) return fromBody;
  // From query string
  return query?.[name];
}

function extractExpandOptions(
  body: Record<string, unknown> | undefined,
  query: Record<string, string>,
): ExpandOptions {
  const filter = extractParam(body, query, "filter", "valueString");
  const displayLanguage = extractParam(body, query, "displayLanguage", "valueString");
  const countStr = extractParam(body, query, "count", "valueInteger");
  const offsetStr = extractParam(body, query, "offset", "valueInteger");

  return {
    filter: filter || undefined,
    displayLanguage: displayLanguage || undefined,
    count: countStr ? parseInt(countStr, 10) : undefined,
    offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
  };
}

// =============================================================================
// Section 4: Response Builders
// =============================================================================

function toExpandParameters(result: { url?: string; name?: string; total: number; contains: Array<{ system?: string; code: string; display?: string }> }) {
  return {
    resourceType: "ValueSet",
    url: result.url,
    name: result.name,
    status: "active",
    expansion: {
      timestamp: new Date().toISOString(),
      total: result.total,
      contains: result.contains.map((c) => ({
        system: c.system,
        code: c.code,
        display: c.display,
      })),
    },
  };
}

function toValidateCodeParameters(result: { result: boolean; display?: string; message?: string }) {
  const params: Array<{ name: string; valueBoolean?: boolean; valueString?: string }> = [
    { name: "result", valueBoolean: result.result },
  ];
  if (result.display) {
    params.push({ name: "display", valueString: result.display });
  }
  if (result.message) {
    params.push({ name: "message", valueString: result.message });
  }
  return {
    resourceType: "Parameters",
    parameter: params,
  };
}

function toLookupParameters(result: { name: string; display?: string; property?: Array<{ code: string; value: unknown }> }) {
  const params: Array<{ name: string; valueString?: string; part?: Array<{ name: string; valueString?: string; valueCode?: string }> }> = [
    { name: "name", valueString: result.name },
  ];
  if (result.display) {
    params.push({ name: "display", valueString: result.display });
  }
  if (result.property) {
    for (const p of result.property) {
      params.push({
        name: "property",
        part: [
          { name: "code", valueCode: p.code },
          { name: "value", valueString: String(p.value) },
        ],
      });
    }
  }
  return {
    resourceType: "Parameters",
    parameter: params,
  };
}

// =============================================================================
// Section 5: Error Handling
// =============================================================================

function sendOutcome(
  reply: FastifyReply,
  status: number,
  outcome: { resourceType: string; issue: unknown[] },
) {
  reply.status(status).header("content-type", FHIR_JSON);
  return outcome;
}

function handleTermError(reply: FastifyReply, err: unknown) {
  if (err instanceof TerminologyError) {
    return sendOutcome(reply, err.status, {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "not-found", diagnostics: err.message }],
    });
  }
  // ResourceNotFoundError from persistence layer
  if ((err as any)?.name === "ResourceNotFoundError") {
    return sendOutcome(reply, 404, {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "not-found", diagnostics: (err as Error).message }],
    });
  }
  return sendOutcome(reply, 500, {
    resourceType: "OperationOutcome",
    issue: [{ severity: "error", code: "exception", diagnostics: (err as Error).message }],
  });
}
