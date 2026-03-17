/**
 * Client-side Subscription Manager
 *
 * Provides a convenient API for managing FHIR Subscriptions
 * and receiving real-time notifications via WebSocket.
 *
 * @module fhir-client
 */

import type { FhirResource } from "./types.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Options for creating a SubscriptionManager.
 */
export interface SubscriptionManagerOptions {
  /** The FHIR Subscription criteria (e.g., "Patient?name=Smith"). */
  criteria: string;
  /** The subscription channel type (default: "websocket"). */
  channelType?: string;
  /** Reason for the subscription. */
  reason?: string;
}

/**
 * Events emitted by the SubscriptionManager.
 */
export type SubscriptionEvent =
  | "connect"
  | "disconnect"
  | "notification"
  | "error"
  | "bound";

/**
 * A notification received from the server.
 */
export interface SubscriptionNotificationEvent {
  subscriptionId: string;
  bundle: Record<string, unknown>;
  resources: FhirResource[];
}

// =============================================================================
// Section 2: SubscriptionManager
// =============================================================================

/**
 * Client-side manager for a single FHIR Subscription.
 *
 * Handles:
 * - Creating the Subscription resource on the server
 * - Establishing a WebSocket connection
 * - Binding to the subscription ID
 * - Emitting notification events
 * - Cleanup on disconnect
 *
 * @example
 * ```ts
 * const mgr = new ClientSubscriptionManager({
 *   criteria: "Observation?patient=Patient/123",
 * });
 * mgr.on("notification", (event) => {
 *   console.log("New resources:", event.resources);
 * });
 * await mgr.connect(client);
 * // ... later
 * mgr.disconnect();
 * ```
 */
export class ClientSubscriptionManager {
  private readonly criteria: string;
  private readonly channelType: string;
  private readonly reason: string;
  private ws: WebSocket | null = null;
  private subscriptionId: string | null = null;
  private connectionId: string | null = null;
  private listeners: Map<SubscriptionEvent, Array<(data?: unknown) => void>> = new Map();
  private _connected = false;

  constructor(options: SubscriptionManagerOptions) {
    this.criteria = options.criteria;
    this.channelType = options.channelType ?? "websocket";
    this.reason = options.reason ?? "Client subscription";
  }

  /**
   * Register an event listener.
   */
  on(event: SubscriptionEvent, handler: (data?: unknown) => void): this {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
    return this;
  }

  /**
   * Remove an event listener.
   */
  off(event: SubscriptionEvent, handler: (data?: unknown) => void): this {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
    return this;
  }

  /**
   * Emit an event to all registered listeners.
   */
  private emit(event: SubscriptionEvent, data?: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {
          // Listener errors should not break the manager
        }
      }
    }
  }

  /**
   * Connect to the server and start receiving notifications.
   *
   * Steps:
   * 1. Create a Subscription resource on the server via FHIR CRUD
   * 2. Open a WebSocket connection to the subscription endpoint
   * 3. Bind to the subscription ID
   *
   * @param createSubscription - Function to create the Subscription resource (usually client.createResource).
   * @param wsUrl - The WebSocket URL (e.g., "ws://localhost:8080/ws/subscriptions").
   */
  async connect(
    createSubscription: (resource: FhirResource) => Promise<FhirResource>,
    wsUrl: string,
  ): Promise<void> {
    // Step 1: Create subscription resource
    const sub = await createSubscription({
      resourceType: "Subscription",
      status: "requested",
      criteria: this.criteria,
      reason: this.reason,
      channel: {
        type: this.channelType,
      },
    });

    this.subscriptionId = sub.id ?? null;

    // Step 2: Connect WebSocket
    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this._connected = true;
          this.emit("connect");
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(String(event.data));
            this.handleMessage(msg, resolve);
          } catch {
            // Ignore malformed messages
          }
        };

        this.ws.onerror = (event: Event) => {
          this.emit("error", event);
          if (!this._connected) reject(new Error("WebSocket connection failed"));
        };

        this.ws.onclose = () => {
          this._connected = false;
          this.emit("disconnect");
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(
    msg: Record<string, unknown>,
    onBound?: (value: void) => void,
  ): void {
    if (msg.type === "connection-available") {
      this.connectionId = msg.connectionId as string;
      // Bind to our subscription
      if (this.ws && this.subscriptionId) {
        this.ws.send(JSON.stringify({
          type: "bind",
          subscriptionId: this.subscriptionId,
        }));
      }
    } else if (msg.type === "bound") {
      this.emit("bound");
      onBound?.();
    } else if ((msg as any).resourceType === "Bundle") {
      // Notification bundle
      const bundle = msg;
      const resources: FhirResource[] = [];
      const entries = (bundle.entry as any[]) ?? [];
      for (const entry of entries) {
        if (entry.resource && entry.resource.resourceType !== "Parameters") {
          resources.push(entry.resource as FhirResource);
        }
      }
      const event: SubscriptionNotificationEvent = {
        subscriptionId: this.subscriptionId ?? "",
        bundle: bundle,
        resources,
      };
      this.emit("notification", event);
    }
  }

  /**
   * Disconnect and clean up.
   */
  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close(1000, "Client disconnect");
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this._connected = false;
    this.subscriptionId = null;
    this.connectionId = null;
  }

  /**
   * Check if the manager is connected.
   */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * Get the subscription ID.
   */
  getSubscriptionId(): string | null {
    return this.subscriptionId;
  }

  /**
   * Get the connection ID.
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }
}
