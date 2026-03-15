/**
 * WebSocket Handler for Subscription Notifications
 *
 * Manages WebSocket connections for FHIR Subscription push notifications.
 * Each connected client can bind to one or more subscription IDs.
 *
 * @module fhir-server/subscriptions
 */

import type { SubscriptionManager, SubscriptionNotification } from "./subscription-manager.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Minimal WebSocket interface (compatible with ws library and native WebSocket).
 */
export interface WsConnection {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * A connected WebSocket client with its bound subscriptions.
 */
export interface WsClient {
  /** Unique connection ID. */
  id: string;
  /** The underlying WebSocket connection. */
  ws: WsConnection;
  /** Set of subscription IDs this client is bound to. */
  boundSubscriptions: Set<string>;
}

// =============================================================================
// Section 2: WebSocket Manager
// =============================================================================

/**
 * Manages WebSocket connections and routes subscription notifications.
 *
 * Protocol:
 * 1. Client connects to ws://server/ws/subscriptions
 * 2. Server sends: { type: "connection-available", connectionId: "..." }
 * 3. Client sends: { type: "bind", subscriptionId: "..." }
 * 4. Server sends: { type: "bound", subscriptionId: "..." }
 * 5. On resource change matching subscription, server sends notification Bundle
 */
export class WebSocketManager {
  private clients: Map<string, WsClient> = new Map();
  private nextId = 1;

  constructor(private readonly subscriptionManager: SubscriptionManager) {
    // Listen for notifications from the subscription manager
    this.subscriptionManager.on("notification", (notification: SubscriptionNotification) => {
      this.routeNotification(notification);
    });
  }

  /**
   * Handle a new WebSocket connection.
   */
  handleConnection(ws: WsConnection): string {
    const id = `ws-${this.nextId++}`;
    const client: WsClient = {
      id,
      ws,
      boundSubscriptions: new Set(),
    };

    this.clients.set(id, client);

    // Send connection-available message
    ws.send(JSON.stringify({
      type: "connection-available",
      connectionId: id,
    }));

    // Handle incoming messages
    ws.on("message", (data: unknown) => {
      try {
        const msg = JSON.parse(String(data));
        this.handleMessage(client, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      this.clients.delete(id);
    });

    return id;
  }

  /**
   * Handle a message from a connected client.
   */
  private handleMessage(client: WsClient, msg: Record<string, unknown>): void {
    if (msg.type === "bind" && typeof msg.subscriptionId === "string") {
      client.boundSubscriptions.add(msg.subscriptionId);
      client.ws.send(JSON.stringify({
        type: "bound",
        subscriptionId: msg.subscriptionId,
      }));
    } else if (msg.type === "unbind" && typeof msg.subscriptionId === "string") {
      client.boundSubscriptions.delete(msg.subscriptionId);
      client.ws.send(JSON.stringify({
        type: "unbound",
        subscriptionId: msg.subscriptionId,
      }));
    }
  }

  /**
   * Route a notification to all clients bound to the subscription.
   */
  private routeNotification(notification: SubscriptionNotification): void {
    const bundle = buildNotificationBundle(notification);
    const payload = JSON.stringify(bundle);

    for (const client of this.clients.values()) {
      if (client.boundSubscriptions.has(notification.subscriptionId)) {
        try {
          if (client.ws.readyState === 1) { // OPEN
            client.ws.send(payload);
          }
        } catch {
          // Connection may have closed
        }
      }
    }
  }

  /**
   * Get the number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get a client by connection ID.
   */
  getClient(id: string): WsClient | undefined {
    return this.clients.get(id);
  }

  /**
   * Disconnect all clients.
   */
  disconnectAll(): void {
    for (const client of this.clients.values()) {
      try {
        client.ws.close(1000, "Server shutdown");
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear();
  }
}

// =============================================================================
// Section 3: Notification Bundle Builder
// =============================================================================

/**
 * Build a FHIR notification Bundle from a subscription notification.
 */
function buildNotificationBundle(notification: SubscriptionNotification): Record<string, unknown> {
  const entries: Array<Record<string, unknown>> = [];

  // SubscriptionStatus entry
  entries.push({
    resource: {
      resourceType: "Parameters",
      parameter: [
        { name: "subscription", valueReference: { reference: `Subscription/${notification.subscriptionId}` } },
        { name: "type", valueCode: notification.type },
        { name: "timestamp", valueInstant: notification.timestamp },
      ],
    },
  });

  // Resource entry (if event-notification with resource)
  if (notification.resource) {
    const rt = notification.resource.resourceType as string;
    const id = notification.resource.id as string;
    entries.push({
      fullUrl: `${rt}/${id}`,
      resource: notification.resource,
    });
  }

  return {
    resourceType: "Bundle",
    type: "history",
    timestamp: notification.timestamp,
    entry: entries,
  };
}
