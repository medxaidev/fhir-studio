/**
 * AuditEvent Builder & Logger
 *
 * Builds FHIR R4 AuditEvent resources for state-changing operations
 * (create, update, delete) and writes them asynchronously via the repository.
 *
 * AuditEvent structure follows:
 * - type: rest (FHIR RESTful interaction)
 * - subtype: create | update | delete
 * - action: C | U | D
 * - outcome: 0 (success)
 * - recorded: ISO timestamp
 * - agent[]: who performed the action (author reference)
 * - source: server identifier
 * - entity[]: what was acted upon (target resource reference)
 *
 * @module fhir-server/audit
 */

import type { ResourceRepository, FhirResource } from "@medxai/fhir-persistence";
import type { OperationContext } from "../auth/middleware.js";

// =============================================================================
// Section 1: Types
// =============================================================================

/** FHIR interaction that triggers an audit event. */
export type AuditableAction = "create" | "update" | "delete";

/** Maps interaction to FHIR AuditEvent action code. */
const ACTION_CODE: Record<AuditableAction, string> = {
  create: "C",
  update: "U",
  delete: "D",
};

/** Maps interaction to AuditEvent subtype display. */
const SUBTYPE_DISPLAY: Record<AuditableAction, string> = {
  create: "create",
  update: "update",
  delete: "delete",
};

/** Maps interaction to AuditEvent subtype code (FHIR REST types). */
const SUBTYPE_CODE: Record<AuditableAction, string> = {
  create: "create",
  update: "update",
  delete: "delete",
};

/**
 * Input for building an AuditEvent.
 */
export interface AuditEventInput {
  /** The action performed. */
  action: AuditableAction;
  /** The target resource type. */
  resourceType: string;
  /** The target resource ID. */
  resourceId: string;
  /** The operation context (author, project, etc.). */
  context?: OperationContext;
  /** The outcome code (0 = success, 4 = minor failure, 8 = serious failure, 12 = major failure). */
  outcomeCode?: string;
  /** Description of the outcome. */
  outcomeDesc?: string;
}

// =============================================================================
// Section 2: AuditEvent Builder
// =============================================================================

/**
 * Build a FHIR R4 AuditEvent resource from the given input.
 *
 * @param input - The audit event parameters.
 * @returns A FhirResource representing the AuditEvent.
 */
export function buildAuditEvent(input: AuditEventInput): FhirResource {
  const { action, resourceType, resourceId, context, outcomeCode = "0", outcomeDesc } = input;

  const now = new Date().toISOString();

  const event: Record<string, unknown> = {
    resourceType: "AuditEvent",
    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
      code: "rest",
      display: "RESTful Operation",
    },
    subtype: [
      {
        system: "http://hl7.org/fhir/restful-interaction",
        code: SUBTYPE_CODE[action],
        display: SUBTYPE_DISPLAY[action],
      },
    ],
    action: ACTION_CODE[action],
    recorded: now,
    outcome: outcomeCode,
    agent: [
      {
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/extra-security-role-type",
              code: "humanuser",
              display: "Human User",
            },
          ],
        },
        who: context?.author
          ? { reference: context.author }
          : { display: "System" },
        requestor: true,
      },
    ],
    source: {
      observer: { display: "MedXAI FHIR Server" },
    },
    entity: [
      {
        what: {
          reference: `${resourceType}/${resourceId}`,
        },
        type: {
          system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
          code: "2",
          display: "System Object",
        },
      },
    ],
  };

  // Add outcome description if provided
  if (outcomeDesc) {
    event.outcomeDesc = outcomeDesc;
  }

  return event as FhirResource;
}

// =============================================================================
// Section 3: Async Logger
// =============================================================================

/**
 * Log an AuditEvent asynchronously (fire-and-forget).
 *
 * Writes the AuditEvent to the repository without blocking the caller.
 * Errors are silently swallowed to avoid disrupting the main operation.
 *
 * @param repo - The resource repository to write to.
 * @param input - The audit event parameters.
 * @param context - The operation context for the audit write itself.
 */
export function logAuditEvent(
  repo: ResourceRepository,
  input: AuditEventInput,
  context?: OperationContext,
): void {
  const auditEvent = buildAuditEvent(input);

  // Fire-and-forget — don't await, don't block the response
  repo.createResource(auditEvent, undefined, context).catch(() => {
    // Silently swallow errors — audit failures must not break operations
  });
}
