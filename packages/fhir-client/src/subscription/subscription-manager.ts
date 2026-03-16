/**
 * Client Subscription Manager
 *
 * WebSocket-based FHIR Subscription management with auto-reconnect.
 * Refactored from old ClientSubscriptionManager with added reconnect logic.
 *
 * @module fhir-client/subscription
 */

import type { Resource, Bundle } from "../types/index.js";

// =============================================================================
// Section 1: Types
// =============================================================================

export type SubscriptionEvent =
  | "connect"
  | "disconnect"
  | "notification"
  | "error"
  | "bound";

export interface SubscriptionNotificationEvent {
  subscriptionId: string;
  bundle: Bundle;
  resources: Resource[];
}

export interface SubscriptionManagerOptions {
  /** Max reconnect attempts (default: 5, 0 = no reconnect). */
  maxReconnectAttempts?: number;
  /** Base reconnect delay in ms (default: 1000). */
  reconnectBaseDelay?: number;
}

// =============================================================================
// Section 2: SubscriptionManager
// =============================================================================

export class ClientSubscriptionManager {
  private readonly options: Required<SubscriptionManagerOptions>;
  private ws: WebSocket | null = null;
  private subscriptionId: string | null = null;
  private connectionId: string | null = null;
  private listeners = new Map<SubscriptionEvent, Array<(data?: unknown) => void>>();
  private _connected = false;
  private reconnectAttempt = 0;

  // Saved for reconnect
  private savedCreateFn?: (resource: Resource) => Promise<Resource>;
  private savedWsUrl?: string;
  private savedCriteria?: string;
  private savedChannelType?: string;
  private savedReason?: string;

  constructor(options?: SubscriptionManagerOptions) {
    this.options = {
      maxReconnectAttempts: options?.maxReconnectAttempts ?? 5,
      reconnectBaseDelay: options?.reconnectBaseDelay ?? 1000,
    };
  }

  // ===========================================================================
  // Event Emitter
  // ===========================================================================

  on(event: SubscriptionEvent, handler: (data?: unknown) => void): this {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
    return this;
  }

  off(event: SubscriptionEvent, handler: (data?: unknown) => void): this {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
    return this;
  }

  private emit(event: SubscriptionEvent, data?: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(data); } catch { /* swallow */ }
      }
    }
  }

  // ===========================================================================
  // Connection
  // ===========================================================================

  /**
   * Connect and subscribe.
   *
   * @param criteria - FHIR Subscription criteria (e.g. "Patient?name=Smith").
   * @param createSubscription - Function to POST Subscription resource.
   * @param wsUrl - WebSocket endpoint URL.
   * @param channelType - Subscription channel type (default: "websocket").
   * @param reason - Subscription reason.
   */
  async connect(
    criteria: string,
    createSubscription: (resource: Resource) => Promise<Resource>,
    wsUrl: string,
    channelType: string = "websocket",
    reason: string = "Client subscription",
  ): Promise<void> {
    // Save for reconnect
    this.savedCriteria = criteria;
    this.savedCreateFn = createSubscription;
    this.savedWsUrl = wsUrl;
    this.savedChannelType = channelType;
    this.savedReason = reason;
    this.reconnectAttempt = 0;

    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    const createFn = this.savedCreateFn!;
    const wsUrl = this.savedWsUrl!;

    // Step 1: Create subscription resource
    const sub = await createFn({
      resourceType: "Subscription",
      status: "requested",
      criteria: this.savedCriteria!,
      reason: this.savedReason!,
      channel: { type: this.savedChannelType! },
    });
    this.subscriptionId = sub.id ?? null;

    // Step 2: Connect WebSocket
    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this._connected = true;
          this.reconnectAttempt = 0;
          this.emit("connect");
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(String(event.data));
            this.handleMessage(msg, resolve);
          } catch { /* ignore malformed */ }
        };

        this.ws.onerror = (event: Event) => {
          this.emit("error", event);
          if (!this._connected) reject(new Error("WebSocket connection failed"));
        };

        this.ws.onclose = () => {
          const wasConnected = this._connected;
          this._connected = false;
          this.emit("disconnect");
          if (wasConnected) {
            void this.attemptReconnect();
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  private handleMessage(
    msg: Record<string, unknown>,
    onBound?: (value: void) => void,
  ): void {
    if (msg.type === "connection-available") {
      this.connectionId = msg.connectionId as string;
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
      const bundle = msg as unknown as Bundle;
      const resources: Resource[] = [];
      for (const entry of bundle.entry ?? []) {
        if (entry.resource && entry.resource.resourceType !== "Parameters") {
          resources.push(entry.resource);
        }
      }
      const notification: SubscriptionNotificationEvent = {
        subscriptionId: this.subscriptionId ?? "",
        bundle,
        resources,
      };
      this.emit("notification", notification);
    }
  }

  // ===========================================================================
  // Auto-Reconnect
  // ===========================================================================

  private async attemptReconnect(): Promise<void> {
    if (this.options.maxReconnectAttempts === 0) return;
    if (this.reconnectAttempt >= this.options.maxReconnectAttempts) return;

    this.reconnectAttempt++;
    const delay = this.options.reconnectBaseDelay * Math.pow(1.5, this.reconnectAttempt - 1);
    await new Promise((r) => setTimeout(r, delay));

    try {
      await this.doConnect();
    } catch {
      // Reconnect failed — will try again on close
    }
  }

  // ===========================================================================
  // Disconnect
  // ===========================================================================

  disconnect(): void {
    // Set maxReconnectAttempts to prevent auto-reconnect on intentional disconnect
    this.reconnectAttempt = this.options.maxReconnectAttempts;

    if (this.ws) {
      try { this.ws.close(1000, "Client disconnect"); } catch { /* ignore */ }
      this.ws = null;
    }
    this._connected = false;
    this.subscriptionId = null;
    this.connectionId = null;
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  get connected(): boolean { return this._connected; }
  getSubscriptionId(): string | null { return this.subscriptionId; }
  getConnectionId(): string | null { return this.connectionId; }
}
