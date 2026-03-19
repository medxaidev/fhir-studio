/**
 * ig-service.ts
 *
 * Business logic layer for the IG Explorer. This is the ONLY service file
 * (along with ig-tree-builder.ts) that imports fhir-runtime.
 *
 * Responsibilities:
 * - Orchestrates calls to fhir-rest-client for IG data
 * - Calls fhir-runtime's buildCanonicalProfile() to build CanonicalProfile
 * - Delegates to ig-tree-builder to produce TreeNode[]
 *
 * @module fhir-studio/services/ig-service
 */

import { buildCanonicalProfile } from 'fhir-runtime';
import type { MedXAIClient, IGSummary, IGIndex, FhirResource } from 'fhir-rest-client';
import { buildTree } from '../lib/ig-tree-builder';
import type { TreeNode } from '../lib/ig-tree-types';

// Re-export for convenience
export type { TreeNode } from '../lib/ig-tree-types';

export class IgService {
  private client: MedXAIClient;

  constructor(client: MedXAIClient) {
    this.client = client;
  }

  /**
   * Load the list of available IGs from the server.
   */
  async loadIGList(): Promise<IGSummary[]> {
    const result = await this.client.loadIGList();
    // Defensive: handle both unwrapped array and { igs: [...] } envelope
    if (Array.isArray(result)) return result;
    const envelope = result as unknown as { igs?: IGSummary[] };
    if (envelope.igs && Array.isArray(envelope.igs)) return envelope.igs;
    return [];
  }

  /**
   * Load the content index for a specific IG.
   */
  async loadIGIndex(igId: string): Promise<IGIndex> {
    return this.client.loadIGIndex(igId);
  }

  /**
   * Load a StructureDefinition and build a full TreeNode[] for rendering.
   *
   * Flow:
   * 1. loadIGStructure → { sd, dependencies }
   * 2. buildCanonicalProfile(sd) → CanonicalProfile
   * 3. buildTree(profile) → TreeNode[]
   */
  async loadProfile(igId: string, sdId: string): Promise<TreeNode[]> {
    // Step 1: Load the SD with dependency info
    const { sd } = await this.client.loadIGStructure(igId, sdId);

    // Step 2: Build canonical profile using fhir-runtime
    // SD must have a snapshot for buildCanonicalProfile to work
    const sdRecord = sd as Record<string, unknown>;
    if (!sdRecord.snapshot) {
      throw new Error(
        `StructureDefinition '${sdId}' has no snapshot — cannot build profile tree.`,
      );
    }

    const profile = buildCanonicalProfile(sd as never);

    // Step 3: Build the tree
    const treeNodes = buildTree(profile as never);
    return treeNodes;
  }

  /**
   * Load a raw FHIR resource by type and id.
   */
  async loadResource(resourceType: string, id: string): Promise<FhirResource> {
    return this.client.readResource(resourceType, id);
  }
}
