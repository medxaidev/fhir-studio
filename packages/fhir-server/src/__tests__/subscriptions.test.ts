/**
 * Phase M: Subscription Manager & WebSocket Tests
 *
 * Tests for:
 * - SubscriptionManager — criteria parsing, subscription lifecycle, evaluation
 * - WebSocketManager — connection handling, bind/unbind, notification routing
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SubscriptionManager,
  parseCriteria,
} from "../subscriptions/subscription-manager.js";
import { WebSocketManager } from "../subscriptions/ws-handler.js";
import type { WsConnection } from "../subscriptions/ws-handler.js";
import { createMockRepo } from "./helpers.js";

// =============================================================================
// Section 1: parseCriteria
// =============================================================================

describe("parseCriteria", () => {
  it("parses simple resource type", () => {
    const c = parseCriteria("Patient");
    expect(c.resourceType).toBe("Patient");
    expect(c.params.size).toBe(0);
  });

  it("parses resource type with single param", () => {
    const c = parseCriteria("Patient?name=Smith");
    expect(c.resourceType).toBe("Patient");
    expect(c.params.get("name")).toBe("Smith");
  });

  it("parses resource type with multiple params", () => {
    const c = parseCriteria("Observation?patient=Patient/123&code=8480-6");
    expect(c.resourceType).toBe("Observation");
    expect(c.params.get("patient")).toBe("Patient/123");
    expect(c.params.get("code")).toBe("8480-6");
  });

  it("handles encoded characters", () => {
    const c = parseCriteria("Patient?name=O%27Brien");
    expect(c.params.get("name")).toBe("O'Brien");
  });
});

// =============================================================================
// Section 2: SubscriptionManager
// =============================================================================

describe("SubscriptionManager", () => {
  let mockRepo: ReturnType<typeof createMockRepo>;
  let mgr: SubscriptionManager;

  beforeEach(() => {
    mockRepo = createMockRepo();
    mgr = new SubscriptionManager(mockRepo);
  });

  it("starts with 0 active subscriptions", () => {
    expect(mgr.getActiveCount()).toBe(0);
  });

  it("addSubscription adds active subscriptions", () => {
    mgr.addSubscription({
      id: "sub-1",
      status: "active",
      criteria: "Patient?name=Smith",
      channel: { type: "websocket" },
    });
    expect(mgr.getActiveCount()).toBe(1);
  });

  it("addSubscription ignores non-active subscriptions", () => {
    mgr.addSubscription({
      id: "sub-1",
      status: "off",
      criteria: "Patient",
    });
    expect(mgr.getActiveCount()).toBe(0);
  });

  it("removeSubscription removes by id", () => {
    mgr.addSubscription({ id: "sub-1", status: "active", criteria: "Patient" });
    mgr.addSubscription({ id: "sub-2", status: "active", criteria: "Observation" });
    expect(mgr.getActiveCount()).toBe(2);
    mgr.removeSubscription("sub-1");
    expect(mgr.getActiveCount()).toBe(1);
  });

  it("evaluateResource emits notification for matching resource", () => {
    mgr.addSubscription({
      id: "sub-1",
      status: "active",
      criteria: "Patient",
      channel: { type: "websocket" },
    });

    const handler = vi.fn();
    mgr.on("notification", handler);

    mgr.evaluateResource(
      { resourceType: "Patient", id: "p-1", name: [{ family: "Smith" }] },
      "create",
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const notification = handler.mock.calls[0][0];
    expect(notification.subscriptionId).toBe("sub-1");
    expect(notification.type).toBe("event-notification");
    expect(notification.resource.id).toBe("p-1");
  });

  it("evaluateResource does not emit for non-matching resource type", () => {
    mgr.addSubscription({
      id: "sub-1",
      status: "active",
      criteria: "Patient",
    });

    const handler = vi.fn();
    mgr.on("notification", handler);

    mgr.evaluateResource(
      { resourceType: "Observation", id: "obs-1" },
      "create",
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("evaluateResource checks parameter filters", () => {
    mgr.addSubscription({
      id: "sub-1",
      status: "active",
      criteria: "Patient?active=true",
    });

    const handler = vi.fn();
    mgr.on("notification", handler);

    // Does not match (active = false)
    mgr.evaluateResource(
      { resourceType: "Patient", id: "p-1", active: false },
      "update",
    );
    expect(handler).not.toHaveBeenCalled();

    // Matches (active = true)
    mgr.evaluateResource(
      { resourceType: "Patient", id: "p-2", active: true },
      "update",
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("evaluateResource omits resource on delete", () => {
    mgr.addSubscription({
      id: "sub-1",
      status: "active",
      criteria: "Patient",
    });

    const handler = vi.fn();
    mgr.on("notification", handler);

    mgr.evaluateResource(
      { resourceType: "Patient", id: "p-1" },
      "delete",
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const notification = handler.mock.calls[0][0];
    expect(notification.resource).toBeUndefined();
  });

  it("loadActiveSubscriptions loads from repo", async () => {
    (mockRepo.searchResources as any).mockResolvedValue({
      resources: [
        {
          resourceType: "Subscription",
          id: "sub-1",
          status: "active",
          criteria: "Patient",
          channel: { type: "websocket" },
        },
        {
          resourceType: "Subscription",
          id: "sub-2",
          status: "active",
          criteria: "Observation?code=8480-6",
          channel: { type: "websocket" },
        },
      ],
    });

    const count = await mgr.loadActiveSubscriptions();
    expect(count).toBe(2);
    expect(mgr.getActiveCount()).toBe(2);
  });

  it("clear removes all subscriptions", () => {
    mgr.addSubscription({ id: "sub-1", status: "active", criteria: "Patient" });
    mgr.addSubscription({ id: "sub-2", status: "active", criteria: "Observation" });
    expect(mgr.getActiveCount()).toBe(2);
    mgr.clear();
    expect(mgr.getActiveCount()).toBe(0);
  });
});

// =============================================================================
// Section 3: WebSocketManager
// =============================================================================

function createMockWs(): WsConnection & { sentMessages: string[]; handlers: Map<string, Function> } {
  const handlers = new Map<string, Function>();
  const ws = {
    readyState: 1, // OPEN
    sentMessages: [] as string[],
    handlers,
    send(data: string) {
      ws.sentMessages.push(data);
    },
    close(_code?: number, _reason?: string) {
      ws.readyState = 3; // CLOSED
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      handlers.set(event, handler);
    },
  };
  return ws;
}

describe("WebSocketManager", () => {
  let mockRepo: ReturnType<typeof createMockRepo>;
  let subMgr: SubscriptionManager;
  let wsMgr: WebSocketManager;

  beforeEach(() => {
    mockRepo = createMockRepo();
    subMgr = new SubscriptionManager(mockRepo);
    wsMgr = new WebSocketManager(subMgr);
  });

  it("handleConnection sends connection-available message", () => {
    const ws = createMockWs();
    const id = wsMgr.handleConnection(ws);

    expect(id).toMatch(/^ws-/);
    expect(ws.sentMessages).toHaveLength(1);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.type).toBe("connection-available");
    expect(msg.connectionId).toBe(id);
  });

  it("tracks connected clients", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    wsMgr.handleConnection(ws1);
    wsMgr.handleConnection(ws2);
    expect(wsMgr.getClientCount()).toBe(2);
  });

  it("bind message adds subscription to client", () => {
    const ws = createMockWs();
    const id = wsMgr.handleConnection(ws);

    // Simulate bind message
    const messageHandler = ws.handlers.get("message");
    messageHandler?.(JSON.stringify({ type: "bind", subscriptionId: "sub-1" }));

    const client = wsMgr.getClient(id);
    expect(client?.boundSubscriptions.has("sub-1")).toBe(true);

    // Should have sent "bound" response
    expect(ws.sentMessages).toHaveLength(2); // connection-available + bound
    const bound = JSON.parse(ws.sentMessages[1]);
    expect(bound.type).toBe("bound");
    expect(bound.subscriptionId).toBe("sub-1");
  });

  it("unbind message removes subscription from client", () => {
    const ws = createMockWs();
    const id = wsMgr.handleConnection(ws);
    const messageHandler = ws.handlers.get("message");

    messageHandler?.(JSON.stringify({ type: "bind", subscriptionId: "sub-1" }));
    messageHandler?.(JSON.stringify({ type: "unbind", subscriptionId: "sub-1" }));

    const client = wsMgr.getClient(id);
    expect(client?.boundSubscriptions.has("sub-1")).toBe(false);
  });

  it("routes notifications to bound clients", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    wsMgr.handleConnection(ws1);
    wsMgr.handleConnection(ws2);

    // Bind ws1 to sub-1
    ws1.handlers.get("message")?.(JSON.stringify({ type: "bind", subscriptionId: "sub-1" }));
    // Bind ws2 to sub-2
    ws2.handlers.get("message")?.(JSON.stringify({ type: "bind", subscriptionId: "sub-2" }));

    // Add subscription and trigger evaluation
    subMgr.addSubscription({ id: "sub-1", status: "active", criteria: "Patient" });
    subMgr.evaluateResource({ resourceType: "Patient", id: "p-1" }, "create");

    // ws1 should receive notification (connection-available + bound + notification)
    expect(ws1.sentMessages).toHaveLength(3);
    const notif = JSON.parse(ws1.sentMessages[2]);
    expect(notif.resourceType).toBe("Bundle");
    expect(notif.type).toBe("history");

    // ws2 should NOT receive notification (only connection-available + bound)
    expect(ws2.sentMessages).toHaveLength(2);
  });

  it("removes client on close", () => {
    const ws = createMockWs();
    wsMgr.handleConnection(ws);
    expect(wsMgr.getClientCount()).toBe(1);

    // Simulate close
    ws.handlers.get("close")?.();
    expect(wsMgr.getClientCount()).toBe(0);
  });

  it("disconnectAll closes all connections", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    wsMgr.handleConnection(ws1);
    wsMgr.handleConnection(ws2);

    wsMgr.disconnectAll();
    expect(wsMgr.getClientCount()).toBe(0);
    expect(ws1.readyState).toBe(3); // CLOSED
    expect(ws2.readyState).toBe(3); // CLOSED
  });
});
