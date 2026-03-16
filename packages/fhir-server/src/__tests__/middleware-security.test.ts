/**
 * Security Headers Middleware — Unit Tests (MW-01)
 */

import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerSecurityHeaders } from "../middleware/security.js";

let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
});

async function buildApp(): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  await registerSecurityHeaders(app);
  app.get("/test", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("Security Headers Middleware", () => {
  it("adds X-Content-Type-Options: nosniff", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("adds Strict-Transport-Security header", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
  });

  it("removes X-Powered-By header", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("does not set Content-Security-Policy (disabled for FHIR API)", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it("adds X-Download-Options header", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-download-options"]).toBe("noopen");
  });

  it("returns 200 for normal requests", async () => {
    await buildApp();
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(200);
  });
});
