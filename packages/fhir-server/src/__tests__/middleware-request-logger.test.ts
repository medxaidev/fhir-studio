/**
 * Request Logger Middleware — Unit Tests (MW-04)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerRequestLogger } from "../middleware/request-logger.js";
import type { RequestLogEntry } from "../middleware/request-logger.js";

let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
});

describe("Request Logger Middleware", () => {
  it("calls logger function on response", async () => {
    const logs: RequestLogEntry[] = [];
    app = Fastify({ logger: false });
    registerRequestLogger(app, (entry) => logs.push(entry));
    app.get("/test", async () => ({ ok: true }));
    await app.ready();

    await app.inject({ method: "GET", url: "/test" });
    expect(logs).toHaveLength(1);
    expect(logs[0].method).toBe("GET");
    expect(logs[0].url).toBe("/test");
    expect(logs[0].statusCode).toBe(200);
  });

  it("logs correct status code for errors", async () => {
    const logs: RequestLogEntry[] = [];
    app = Fastify({ logger: false });
    registerRequestLogger(app, (entry) => logs.push(entry));
    app.get("/missing", async (_req, reply) => {
      reply.status(404).send({ error: "not found" });
    });
    await app.ready();

    await app.inject({ method: "GET", url: "/missing" });
    expect(logs[0].statusCode).toBe(404);
  });

  it("includes responseTime as a number", async () => {
    const logs: RequestLogEntry[] = [];
    app = Fastify({ logger: false });
    registerRequestLogger(app, (entry) => logs.push(entry));
    app.get("/test", async () => ({ ok: true }));
    await app.ready();

    await app.inject({ method: "GET", url: "/test" });
    expect(typeof logs[0].responseTime).toBe("number");
    expect(logs[0].responseTime).toBeGreaterThanOrEqual(0);
  });

  it("logs POST method correctly", async () => {
    const logs: RequestLogEntry[] = [];
    app = Fastify({ logger: false });
    registerRequestLogger(app, (entry) => logs.push(entry));
    app.post("/data", async () => ({ created: true }));
    await app.ready();

    await app.inject({ method: "POST", url: "/data", payload: {} });
    expect(logs[0].method).toBe("POST");
  });

  it("uses default logger when none provided (no crash)", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    app = Fastify({ logger: false });
    registerRequestLogger(app);
    app.get("/test", async () => ({ ok: true }));
    await app.ready();

    await app.inject({ method: "GET", url: "/test" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("logs multiple requests", async () => {
    const logs: RequestLogEntry[] = [];
    app = Fastify({ logger: false });
    registerRequestLogger(app, (entry) => logs.push(entry));
    app.get("/a", async () => ({ a: true }));
    app.get("/b", async () => ({ b: true }));
    await app.ready();

    await app.inject({ method: "GET", url: "/a" });
    await app.inject({ method: "GET", url: "/b" });
    expect(logs).toHaveLength(2);
    expect(logs[0].url).toBe("/a");
    expect(logs[1].url).toBe("/b");
  });
});
