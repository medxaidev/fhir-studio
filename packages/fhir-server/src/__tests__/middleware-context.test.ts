/**
 * Request Context Middleware — Unit Tests (MW-05)
 */

import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerRequestContext } from "../middleware/context.js";

let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
});

async function buildApp(): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  registerRequestContext(app);
  app.get("/test", async () => ({ ok: true }));
  app.post("/fhir", async (req) => req.body);
  await app.ready();
  return app;
}

describe("Request Context Middleware", () => {
  // ── Request ID ──────────────────────────────────────────────────────────

  it("generates x-request-id if not provided", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect((res.headers["x-request-id"] as string).length).toBeGreaterThan(0);
  });

  it("preserves client-supplied x-request-id", async () => {
    await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { "x-request-id": "client-id-123" },
    });
    expect(res.headers["x-request-id"]).toBe("client-id-123");
  });

  it("generates unique request IDs for different requests", async () => {
    await buildApp();
    const res1 = await app.inject({ method: "GET", url: "/test" });
    const res2 = await app.inject({ method: "GET", url: "/test" });
    expect(res1.headers["x-request-id"]).not.toBe(res2.headers["x-request-id"]);
  });

  // ── application/fhir+json parser ─────────────────────────────────────────

  it("parses application/fhir+json body as JSON", async () => {
    await buildApp();
    const payload = { resourceType: "Patient", name: [{ family: "Doe" }] };
    const res = await app.inject({
      method: "POST",
      url: "/fhir",
      headers: { "content-type": "application/fhir+json" },
      payload: JSON.stringify(payload),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("Patient");
  });

  it("handles empty application/fhir+json body", async () => {
    await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/fhir",
      headers: { "content-type": "application/fhir+json" },
      payload: "",
    });
    // Empty body should not crash
    expect(res.statusCode).toBeLessThan(500);
  });

  // ── application/json-patch+json parser ────────────────────────────────────

  it("parses application/json-patch+json body as JSON", async () => {
    await buildApp();
    const patch = [{ op: "replace", path: "/active", value: true }];
    const res = await app.inject({
      method: "POST",
      url: "/fhir",
      headers: { "content-type": "application/json-patch+json" },
      payload: JSON.stringify(patch),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].op).toBe("replace");
  });

  // ── application/x-www-form-urlencoded parser ──────────────────────────────

  it("parses application/x-www-form-urlencoded body", async () => {
    await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/fhir",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "name=John&family=Doe",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe("John");
    expect(body.family).toBe("Doe");
  });

  it("decodes URL-encoded characters in form data", async () => {
    await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/fhir",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "name=John%20Doe&code=A%26B",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe("John Doe");
    expect(body.code).toBe("A&B");
  });
});
