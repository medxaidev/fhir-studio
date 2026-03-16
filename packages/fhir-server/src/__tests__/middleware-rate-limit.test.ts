/**
 * Rate Limit Middleware — Unit Tests (MW-03)
 */

import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerRateLimit } from "../middleware/rate-limit.js";

let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
});

async function buildApp(config?: Parameters<typeof registerRateLimit>[1]): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  await registerRateLimit(app, config);
  app.get("/test", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("Rate Limit Middleware", () => {
  it("allows requests under the limit", async () => {
    await buildApp({ max: 10, timeWindow: 60000 });
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 429 when limit is exceeded", async () => {
    await buildApp({ max: 2, timeWindow: 60000 });
    await app.inject({ method: "GET", url: "/test" });
    await app.inject({ method: "GET", url: "/test" });
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(429);
  });

  it("returns OperationOutcome body on 429", async () => {
    await buildApp({ max: 1, timeWindow: 60000 });
    await app.inject({ method: "GET", url: "/test" });
    const res = await app.inject({ method: "GET", url: "/test" });
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe("OperationOutcome");
    expect(body.issue[0].code).toBe("throttled");
  });

  it("includes rate limit headers", async () => {
    await buildApp({ max: 10, timeWindow: 60000 });
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });

  it("skips registration when enabled=false", async () => {
    await buildApp({ enabled: false, max: 1, timeWindow: 60000 });
    // Should not be rate limited even after many requests
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/test" });
      expect(res.statusCode).toBe(200);
    }
  });

  it("includes retry-after header on 429", async () => {
    await buildApp({ max: 1, timeWindow: 60000 });
    await app.inject({ method: "GET", url: "/test" });
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });
});
