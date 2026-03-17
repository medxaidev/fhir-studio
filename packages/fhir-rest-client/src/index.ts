/**
 * `@medxai/fhir-client` — Public API
 *
 * TypeScript FHIR R4 client SDK for MedXAI.
 *
 * @packageDocumentation
 */

export { MedXAIClient } from './client.js';
export type {
  FhirResource,
  Bundle,
  OperationOutcome,
  MedXAIClientConfig,
  LoginResponse,
  TokenResponse,
  SignInResult,
  PatchOperation,
  RequestOptions,
  ResourceArray,
  BatchQueueEntry,
} from './types.js';
export { FhirClientError } from './types.js';
export { ClientSubscriptionManager } from './subscription-manager.js';
export type {
  SubscriptionManagerOptions,
  SubscriptionEvent,
  SubscriptionNotificationEvent,
} from './subscription-manager.js';
