/**
 * CORS Middleware — Unit Tests (MW-02)
 */

import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerCors } from "../middleware/cors.js";

let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
});

async function buildApp(config?: Parameters<typeof registerCors>[1]): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  await registerCors(app, config);
  app.get("/test", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("CORS Middleware", () => {
  it("allows GET requests with default config", async () => {
    await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { origin: "http://example.com" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });

  it("responds to preflight OPTIONS with allowed methods", async () => {
    await buildApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/test",
      headers: {
        origin: "http://example.com",
        "access-control-request-method": "POST",
      },
    });
    expect(res.statusCode).toBe(204);
    const allowedMethods = res.headers["access-control-allow-methods"];
    expect(allowedMethods).toContain("GET");
    expect(allowedMethods).toContain("POST");
    expect(allowedMethods).toContain("DELETE");
  });

  it("includes FHIR-specific headers in allowed headers", async () => {
    await buildApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/test",
      headers: {
        origin: "http://example.com",
        "access-control-request-method": "GET",
        "access-control-request-headers": "Authorization, If-Match",
      },
    });
    const allowed = res.headers["access-control-allow-headers"] as string;
    expect(allowed).toContain("Authorization");
    expect(allowed).toContain("If-Match");
  });

  it("exposes ETag and Location headers", async () => {
    await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { origin: "http://example.com" },
    });
    const exposed = res.headers["access-control-expose-headers"] as string;
    expect(exposed).toContain("ETag");
    expect(exposed).toContain("Location");
  });

  it("allows credentials by default", async () => {
    await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { origin: "http://example.com" },
    });
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("respects custom origin config", async () => {
    await buildApp({ origin: "http://specific.com" });
    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: { origin: "http://specific.com" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://specific.com");
  });

  it("sets max-age for preflight cache", async () => {
    await buildApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/test",
      headers: {
        origin: "http://example.com",
        "access-control-request-method": "GET",
      },
    });
    expect(res.headers["access-control-max-age"]).toBe("86400");
  });
});
