/**
 * Subscription Manager
 *
 * Server-side engine for evaluating FHIR Subscription resources.
 * Maintains an in-memory list of active subscriptions and evaluates
 * resource changes against subscription criteria.
 *
 * @module fhir-server/subscriptions
 */

import type { ResourceRepository } from "@medxai/fhir-persistence";
import { EventEmitter } from "node:events";

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * A parsed subscription criteria.
 */
export interface SubscriptionCriteria {
  /** The resource type to watch (e.g., "Patient"). */
  resourceType: string;
  /** Optional search parameter filters (key=value pairs). */
  params: Map<string, string>;
}

/**
 * An active subscription tracked by the manager.
 */
export interface ActiveSubscription {
  id: string;
  criteria: SubscriptionCriteria;
  channel: {
    type: string;
    endpoint?: string;
  };
  status: string;
}

/**
 * A notification emitted when a subscription matches a resource change.
 */
export interface SubscriptionNotification {
  subscriptionId: string;
  type: "handshake" | "heartbeat" | "event-notification";
  resource?: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// Section 2: Criteria Parser
// =============================================================================

/**
 * Parse a FHIR Subscription.criteria string.
 *
 * Format: "ResourceType?param1=value1&param2=value2"
 *
 * @example parseCriteria("Patient?name=Smith") → { resourceType: "Patient", params: Map { "name" → "Smith" } }
 */
export function parseCriteria(criteria: string): SubscriptionCriteria {
  const qIdx = criteria.indexOf("?");
  if (qIdx === -1) {
    return { resourceType: criteria.trim(), params: new Map() };
  }

  const resourceType = criteria.substring(0, qIdx).trim();
  const paramStr = criteria.substring(qIdx + 1);
  const params = new Map<string, string>();

  for (const pair of paramStr.split("&")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = decodeURIComponent(pair.substring(0, eqIdx).trim());
    const value = decodeURIComponent(pair.substring(eqIdx + 1).trim());
    if (key) params.set(key, value);
  }

  return { resourceType, params };
}

// =============================================================================
// Section 3: Subscription Manager
// =============================================================================

/**
 * Manages FHIR Subscriptions in memory.
 *
 * Emits "notification" events when a resource change matches
 * a subscription's criteria.
 *
 * Usage:
 * ```ts
 * const mgr = new SubscriptionManager(repo);
 * await mgr.loadActiveSubscriptions();
 * mgr.on("notification", (n) => sendToWebSocket(n));
 * mgr.evaluateResource(patient, "create");
 * ```
 */
export class SubscriptionManager extends EventEmitter {
  private subscriptions: Map<string, ActiveSubscription> = new Map();
  private readonly repo: ResourceRepository;

  constructor(repo: ResourceRepository) {
    super();
    this.repo = repo;
  }

  /**
   * Load all active Subscription resources from the database.
   */
  async loadActiveSubscriptions(): Promise<number> {
    try {
      const result = await this.repo.searchResources({
        resourceType: "Subscription",
        params: [{ code: "status", values: ["active"] }],
        count: 1000,
      });

      this.subscriptions.clear();
      for (const sub of result.resources) {
        const s = sub as Record<string, any>;
        if (s.status === "active" && s.criteria) {
          this.subscriptions.set(s.id, {
            id: s.id,
            criteria: parseCriteria(s.criteria),
            channel: s.channel ?? { type: "websocket" },
            status: "active",
          });
        }
      }
      return this.subscriptions.size;
    } catch {
      return 0;
    }
  }

  /**
   * Add or update a subscription in the active set.
   */
  addSubscription(sub: Record<string, any>): void {
    if (sub.status !== "active" || !sub.criteria) return;
    this.subscriptions.set(sub.id, {
      id: sub.id,
      criteria: parseCriteria(sub.criteria),
      channel: sub.channel ?? { type: "websocket" },
      status: "active",
    });
  }

  /**
   * Remove a subscription from the active set.
   */
  removeSubscription(id: string): void {
    this.subscriptions.delete(id);
  }

  /**
   * Get the number of active subscriptions.
   */
  getActiveCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get all active subscriptions.
   */
  getActiveSubscriptions(): ActiveSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Evaluate a resource change against all active subscriptions.
   *
   * @param resource - The changed resource.
   * @param action - The type of change: "create", "update", "delete".
   */
  evaluateResource(
    resource: Record<string, unknown>,
    action: "create" | "update" | "delete",
  ): void {
    const resourceType = resource.resourceType as string;
    if (!resourceType) return;

    for (const sub of this.subscriptions.values()) {
      if (sub.criteria.resourceType !== resourceType) continue;

      // Check parameter filters (simple string matching)
      let matches = true;
      for (const [key, value] of sub.criteria.params) {
        const resourceValue = getNestedValue(resource, key);
        if (resourceValue === undefined || String(resourceValue) !== value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        const notification: SubscriptionNotification = {
          subscriptionId: sub.id,
          type: "event-notification",
          resource: action !== "delete" ? resource : undefined,
          timestamp: new Date().toISOString(),
        };
        this.emit("notification", notification);
      }
    }
  }

  /**
   * Clear all subscriptions.
   */
  clear(): void {
    this.subscriptions.clear();
  }
}

// =============================================================================
// Section 4: Helpers
// =============================================================================

/**
 * Get a nested value from an object by dot-separated path.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
