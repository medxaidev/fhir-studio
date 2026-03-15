/**
 * AuditEvent Builder & Logger Tests
 *
 * Unit tests for buildAuditEvent and logAuditEvent.
 */

import { describe, it, expect, vi } from "vitest";
import { buildAuditEvent, logAuditEvent } from "../../audit/audit-event.js";
import type { AuditEventInput } from "../../audit/audit-event.js";
import type { ResourceRepository } from "@medxai/fhir-persistence";

// =============================================================================
// buildAuditEvent
// =============================================================================

describe("buildAuditEvent", () => {
  it("builds a create AuditEvent", () => {
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "abc-123",
    });

    expect(event.resourceType).toBe("AuditEvent");
    expect((event as any).action).toBe("C");
    expect((event as any).outcome).toBe("0");
    expect((event as any).type.code).toBe("rest");
    expect((event as any).subtype[0].code).toBe("create");
    expect((event as any).subtype[0].display).toBe("create");
    expect((event as any).entity[0].what.reference).toBe("Patient/abc-123");
    expect((event as any).recorded).toBeDefined();
  });

  it("builds an update AuditEvent", () => {
    const event = buildAuditEvent({
      action: "update",
      resourceType: "Observation",
      resourceId: "obs-1",
    });

    expect((event as any).action).toBe("U");
    expect((event as any).subtype[0].code).toBe("update");
    expect((event as any).entity[0].what.reference).toBe("Observation/obs-1");
  });

  it("builds a delete AuditEvent", () => {
    const event = buildAuditEvent({
      action: "delete",
      resourceType: "Patient",
      resourceId: "del-1",
    });

    expect((event as any).action).toBe("D");
    expect((event as any).subtype[0].code).toBe("delete");
    expect((event as any).entity[0].what.reference).toBe("Patient/del-1");
  });

  it("includes author reference from context", () => {
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
      context: {
        project: "proj-1",
        author: "Practitioner/doc-1",
      },
    });

    expect((event as any).agent[0].who.reference).toBe("Practitioner/doc-1");
  });

  it("uses 'System' display when no author", () => {
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
    });

    expect((event as any).agent[0].who.display).toBe("System");
    expect((event as any).agent[0].who.reference).toBeUndefined();
  });

  it("includes outcomeDesc when provided", () => {
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
      outcomeDesc: "Resource created successfully",
    });

    expect((event as any).outcomeDesc).toBe("Resource created successfully");
  });

  it("omits outcomeDesc when not provided", () => {
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
    });

    expect((event as any).outcomeDesc).toBeUndefined();
  });

  it("sets custom outcome code", () => {
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
      outcomeCode: "4",
    });

    expect((event as any).outcome).toBe("4");
  });

  it("includes source observer", () => {
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
    });

    expect((event as any).source.observer.display).toBe("MedXAI FHIR Server");
  });

  it("sets agent requestor to true", () => {
    const event = buildAuditEvent({
      action: "update",
      resourceType: "Patient",
      resourceId: "p-1",
    });

    expect((event as any).agent[0].requestor).toBe(true);
  });

  it("recorded timestamp is a valid ISO string", () => {
    const before = new Date().toISOString();
    const event = buildAuditEvent({
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
    });
    const after = new Date().toISOString();

    const recorded = (event as any).recorded;
    expect(recorded >= before).toBe(true);
    expect(recorded <= after).toBe(true);
  });
});

// =============================================================================
// logAuditEvent
// =============================================================================

describe("logAuditEvent", () => {
  it("calls repo.createResource with AuditEvent", () => {
    const mockCreate = vi.fn().mockResolvedValue({});
    const mockRepo = { createResource: mockCreate } as unknown as ResourceRepository;

    logAuditEvent(mockRepo, {
      action: "create",
      resourceType: "Patient",
      resourceId: "p-1",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [resource] = mockCreate.mock.calls[0];
    expect(resource.resourceType).toBe("AuditEvent");
  });

  it("passes context to createResource", () => {
    const mockCreate = vi.fn().mockResolvedValue({});
    const mockRepo = { createResource: mockCreate } as unknown as ResourceRepository;
    const ctx = { project: "proj-1", author: "User/u1" };

    logAuditEvent(mockRepo, {
      action: "update",
      resourceType: "Patient",
      resourceId: "p-1",
      context: ctx,
    }, ctx);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [, , passedCtx] = mockCreate.mock.calls[0];
    expect(passedCtx).toEqual(ctx);
  });

  it("does not throw when createResource fails", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("DB error"));
    const mockRepo = { createResource: mockCreate } as unknown as ResourceRepository;

    // Should not throw
    expect(() => {
      logAuditEvent(mockRepo, {
        action: "delete",
        resourceType: "Patient",
        resourceId: "p-1",
      });
    }).not.toThrow();

    // Wait for the promise to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
