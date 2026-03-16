/**
 * Subscription Manager — Unit Tests (SUB-01)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SubscriptionManager } from "../subscription/subscription-manager.js";
import type { ActiveSubscription, SubscriptionNotification } from "../subscription/subscription-manager.js";
import type { PersistedResource } from "../types/fhir.js";

function mockResource(type: string, id: string): PersistedResource {
  return { resourceType: type, id, meta: { versionId: "1", lastUpdated: "2026-01-15T10:00:00Z" } };
}

let mgr: SubscriptionManager;

beforeEach(() => {
  mgr = new SubscriptionManager();
});

describe("SubscriptionManager", () => {
  // Registration
  it("registers a subscription", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    expect(mgr.size).toBe(1);
  });

  it("unregisters a subscription", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    mgr.unregister("sub-1");
    expect(mgr.size).toBe(0);
  });

  it("getAll returns all subscriptions", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    mgr.register({ id: "sub-2", criteria: "Observation", resourceType: "Observation", channelType: "rest-hook" });
    expect(mgr.getAll()).toHaveLength(2);
  });

  it("clear removes all subscriptions", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    mgr.clear();
    expect(mgr.size).toBe(0);
  });

  // Evaluation & notification
  it("emits notification for matching resourceType", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    const notifications: SubscriptionNotification[] = [];
    mgr.on("notification", (n) => notifications.push(n));

    mgr.evaluateResource(mockResource("Patient", "p-1"), "create");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].subscriptionId).toBe("sub-1");
    expect(notifications[0].action).toBe("create");
  });

  it("does not emit for non-matching resourceType", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    const notifications: SubscriptionNotification[] = [];
    mgr.on("notification", (n) => notifications.push(n));

    mgr.evaluateResource(mockResource("Observation", "obs-1"), "create");
    expect(notifications).toHaveLength(0);
  });

  it("wildcard subscription matches all types", () => {
    mgr.register({ id: "sub-all", criteria: "*", resourceType: "*", channelType: "websocket" });
    const notifications: SubscriptionNotification[] = [];
    mgr.on("notification", (n) => notifications.push(n));

    mgr.evaluateResource(mockResource("Patient", "p-1"), "create");
    mgr.evaluateResource(mockResource("Observation", "obs-1"), "update");
    expect(notifications).toHaveLength(2);
  });

  it("notification bundle is subscription-notification type", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    const notifications: SubscriptionNotification[] = [];
    mgr.on("notification", (n) => notifications.push(n));

    mgr.evaluateResource(mockResource("Patient", "p-1"), "update");
    expect(notifications[0].bundle.type).toBe("subscription-notification");
    expect(notifications[0].bundle.entry).toHaveLength(1);
  });

  it("notification bundle entry has correct request method for create", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    const notifications: SubscriptionNotification[] = [];
    mgr.on("notification", (n) => notifications.push(n));

    mgr.evaluateResource(mockResource("Patient", "p-1"), "create");
    expect(notifications[0].bundle.entry![0].request!.method).toBe("POST");
  });

  it("notification bundle entry has correct request method for delete", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    const notifications: SubscriptionNotification[] = [];
    mgr.on("notification", (n) => notifications.push(n));

    mgr.evaluateResource(mockResource("Patient", "p-1"), "delete");
    expect(notifications[0].bundle.entry![0].request!.method).toBe("DELETE");
  });

  it("multiple subscriptions can match same resource", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    mgr.register({ id: "sub-2", criteria: "Patient", resourceType: "Patient", channelType: "rest-hook" });
    const notifications: SubscriptionNotification[] = [];
    mgr.on("notification", (n) => notifications.push(n));

    mgr.evaluateResource(mockResource("Patient", "p-1"), "create");
    expect(notifications).toHaveLength(2);
  });

  it("swallows listener errors (fire-and-forget)", () => {
    mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
    mgr.on("notification", () => { throw new Error("listener crash"); });

    // Should not throw
    expect(() => mgr.evaluateResource(mockResource("Patient", "p-1"), "create")).not.toThrow();
  });
});
