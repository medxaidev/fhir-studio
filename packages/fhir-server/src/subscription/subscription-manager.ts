/**
 * Subscription Manager
 *
 * Manages active FHIR Subscriptions in memory.
 * Evaluates resources against subscription criteria and emits notifications.
 *
 * @module fhir-server/subscription
 */

import { EventEmitter } from "node:events";
import type { Resource, PersistedResource, Bundle, BundleEntry } from "../types/fhir.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/** Subscription action that triggered the notification. */
export type SubscriptionAction = "create" | "update" | "delete";

/** An active subscription registration. */
export interface ActiveSubscription {
  id: string;
  criteria: string;
  resourceType: string;
  channelType: "websocket" | "rest-hook";
  endpoint?: string;
}

/** Notification payload emitted when a subscription matches. */
export interface SubscriptionNotification {
  subscriptionId: string;
  action: SubscriptionAction;
  resource: PersistedResource;
  bundle: Bundle;
}

// =============================================================================
// Section 2: Manager
// =============================================================================

/**
 * SubscriptionManager — in-memory subscription registry.
 *
 * Usage:
 * ```typescript
 * const mgr = new SubscriptionManager();
 * mgr.register({ id: "sub-1", criteria: "Patient", resourceType: "Patient", channelType: "websocket" });
 * mgr.on("notification", (notification) => { ... });
 * mgr.evaluateResource(patient, "create");
 * ```
 */
export class SubscriptionManager extends EventEmitter {
  private subscriptions = new Map<string, ActiveSubscription>();

  /**
   * Register an active subscription.
   */
  register(subscription: ActiveSubscription): void {
    this.subscriptions.set(subscription.id, subscription);
  }

  /**
   * Unregister a subscription by ID.
   */
  unregister(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get all active subscriptions.
   */
  getAll(): ActiveSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get active subscription count.
   */
  get size(): number {
    return this.subscriptions.size;
  }

  /**
   * Evaluate a resource change against all active subscriptions.
   * Emits 'notification' for each matching subscription.
   *
   * This is fire-and-forget — errors are logged but don't propagate.
   */
  evaluateResource(resource: PersistedResource, action: SubscriptionAction): void {
    for (const sub of this.subscriptions.values()) {
      if (matchesCriteria(sub, resource)) {
        const bundle = buildNotificationBundle(sub, resource, action);
        const notification: SubscriptionNotification = {
          subscriptionId: sub.id,
          action,
          resource,
          bundle,
        };

        try {
          this.emit("notification", notification);
        } catch {
          // Fire-and-forget — swallow errors
        }
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
// Section 3: Matching
// =============================================================================

/**
 * Check if a resource matches a subscription's criteria.
 *
 * For v0.1.0: simple resourceType matching.
 * Full criteria evaluation (FHIRPath) deferred to v0.2.0.
 */
function matchesCriteria(sub: ActiveSubscription, resource: Resource): boolean {
  return sub.resourceType === resource.resourceType || sub.resourceType === "*";
}

// =============================================================================
// Section 4: Notification Bundle
// =============================================================================

/**
 * Build a subscription-notification Bundle.
 */
function buildNotificationBundle(
  sub: ActiveSubscription,
  resource: PersistedResource,
  action: SubscriptionAction,
): Bundle {
  const entry: BundleEntry = {
    fullUrl: `${resource.resourceType}/${resource.id}`,
    resource,
    request: {
      method: action === "create" ? "POST" : action === "update" ? "PUT" : "DELETE",
      url: `${resource.resourceType}/${resource.id}`,
    },
  };

  return {
    resourceType: "Bundle",
    type: "subscription-notification",
    entry: [entry],
  };
}
