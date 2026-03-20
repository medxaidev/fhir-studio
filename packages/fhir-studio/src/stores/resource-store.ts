/**
 * Resource Store — manages CRUD state for the Resource Explorer page.
 *
 * Uses the same useSyncExternalStore pattern as server-store.
 *
 * @module fhir-studio/stores/resource-store
 */

import type { FhirResource, ProfileEntry } from 'fhir-rest-client';
import { serverStore } from './server-store';
import { SchemaService } from '../services/schema-service';
import type { ParsedSchema } from '../components/fhir-react/types/schema-types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ResourceViewMode = 'types' | 'list' | 'create' | 'edit';

export interface ResourceStoreState {
  viewMode: ResourceViewMode;
  resourceTypes: string[];
  resourceTypesLoading: boolean;
  resourceTypesError: string | null;

  selectedType: string | null;
  resources: FhirResource[];
  resourcesLoading: boolean;
  resourcesError: string | null;

  availableProfiles: ProfileEntry[];
  selectedProfileUrl: string | null;

  editingResource: FhirResource | null;
  schema: ParsedSchema | null;
  schemaLoading: boolean;
  schemaError: string | null;

  saving: boolean;
  saveError: string | null;
}

// ─── Initial state ──────────────────────────────────────────────────────────

const initialState: ResourceStoreState = {
  viewMode: 'types',
  resourceTypes: [],
  resourceTypesLoading: false,
  resourceTypesError: null,
  selectedType: null,
  resources: [],
  resourcesLoading: false,
  resourcesError: null,
  availableProfiles: [],
  selectedProfileUrl: null,
  editingResource: null,
  schema: null,
  schemaLoading: false,
  schemaError: null,
  saving: false,
  saveError: null,
};

// ─── Store internals ────────────────────────────────────────────────────────

let _state: ResourceStoreState = { ...initialState };
let _schemaService: SchemaService | null = null;
const _listeners = new Set<() => void>();

function setState(partial: Partial<ResourceStoreState>) {
  _state = { ..._state, ...partial };
  _listeners.forEach((fn) => fn());
}

function getSchemaService(): SchemaService {
  const client = serverStore.getClient();
  if (!client) throw new Error('No server connection');
  if (!_schemaService) {
    _schemaService = new SchemaService(client);
  }
  return _schemaService;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const resourceStore = {
  getState(): ResourceStoreState {
    return _state;
  },

  subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  reset() {
    _state = { ...initialState };
    _schemaService = null;
    _listeners.forEach((fn) => fn());
  },

  // ── Navigation ──────────────────────────────────────────────────────────

  goToTypes() {
    setState({
      viewMode: 'types',
      selectedType: null,
      resources: [],
      editingResource: null,
      schema: null,
      schemaError: null,
      saveError: null,
    });
  },

  goToList(resourceType: string) {
    setState({
      viewMode: 'list',
      selectedType: resourceType,
      editingResource: null,
      saveError: null,
      availableProfiles: [],
      selectedProfileUrl: null,
    });
    void resourceStore.loadResources(resourceType);
    void resourceStore.loadProfiles(resourceType);
  },

  goToCreate() {
    if (!_state.selectedType) return;
    setState({
      viewMode: 'create',
      editingResource: { resourceType: _state.selectedType } as FhirResource,
      saveError: null,
    });
  },

  goToEdit(resource: FhirResource) {
    setState({
      viewMode: 'edit',
      editingResource: resource,
      saveError: null,
    });
  },

  // ── Data loading ────────────────────────────────────────────────────────

  async loadResourceTypes(): Promise<void> {
    const client = serverStore.getClient();
    if (!client) {
      setState({ resourceTypesError: 'No server connection' });
      return;
    }

    console.log('[resource-store] Loading resource types from:', client.getBaseUrl());
    setState({ resourceTypesLoading: true, resourceTypesError: null });
    try {
      const types = await client.loadResourceTypes();
      console.log('[resource-store] Loaded resource types:', types.length);
      setState({ resourceTypes: types, resourceTypesLoading: false });
      console.log('[resource-store] State after loading:', {
        resourceTypes: _state.resourceTypes.length,
        resourceTypesLoading: _state.resourceTypesLoading,
        viewMode: _state.viewMode
      });
    } catch (err) {
      console.error('[resource-store] Failed to load resource types:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load resource types';
      setState({ resourceTypesLoading: false, resourceTypesError: msg });
    }
  },

  async loadResources(resourceType: string): Promise<void> {
    const client = serverStore.getClient();
    if (!client) return;

    console.log('[resource-store] Loading resources for type:', resourceType);
    setState({ resourcesLoading: true, resourcesError: null });
    try {
      const timeoutMs = 30000; // 30 second timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out after 30 seconds')), timeoutMs)
      );

      const bundle = await Promise.race([
        client.search(resourceType, { _count: '50', _sort: '-_lastUpdated' }),
        timeoutPromise
      ]);

      console.log('[resource-store] Loaded resources:', bundle.entry?.length ?? 0);
      const entries = (bundle.entry ?? [])
        .map((e: { resource?: FhirResource }) => e.resource)
        .filter(Boolean) as FhirResource[];
      setState({ resources: entries, resourcesLoading: false });
      console.log('[resource-store] Resources state updated:', {
        count: _state.resources.length,
        loading: _state.resourcesLoading
      });
    } catch (err) {
      console.error('[resource-store] Failed to load resources:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load resources';
      setState({ resourcesLoading: false, resourcesError: msg });
    }
  },

  async loadProfiles(resourceType: string): Promise<void> {
    const client = serverStore.getClient();
    if (!client) return;

    try {
      const profiles = await client.loadProfilesForType(resourceType);
      const baseProfile = profiles.find((p) => p.isBase);
      setState({
        availableProfiles: profiles,
        selectedProfileUrl: baseProfile?.url ?? profiles[0]?.url ?? null,
      });
      // Load schema for default (base) profile
      if (baseProfile) {
        void resourceStore.loadSchema(resourceType);
      } else if (profiles.length > 0) {
        void resourceStore.loadSchemaByProfile(profiles[0].id);
      }
    } catch {
      // Fallback: just load base schema
      void resourceStore.loadSchema(resourceType);
    }
  },

  selectProfile(profileUrl: string): void {
    const profile = _state.availableProfiles.find((p) => p.url === profileUrl);
    if (!profile) return;
    setState({ selectedProfileUrl: profileUrl, schema: null });
    if (profile.isBase && _state.selectedType) {
      void resourceStore.loadSchema(_state.selectedType);
    } else {
      void resourceStore.loadSchemaByProfile(profile.id);
    }
  },

  async loadSchema(resourceType: string): Promise<void> {
    setState({ schemaLoading: true, schemaError: null });
    try {
      const svc = getSchemaService();
      const schema = await svc.loadSchema(resourceType);
      setState({ schema, schemaLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load schema';
      setState({ schemaLoading: false, schemaError: msg });
    }
  },

  async loadSchemaByProfile(profileId: string): Promise<void> {
    setState({ schemaLoading: true, schemaError: null });
    try {
      const svc = getSchemaService();
      const schema = await svc.loadProfileSchema(profileId);
      setState({ schema, schemaLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load profile schema';
      setState({ schemaLoading: false, schemaError: msg });
    }
  },

  // ── CRUD operations ─────────────────────────────────────────────────────

  async createResource(resource: FhirResource): Promise<boolean> {
    const client = serverStore.getClient();
    if (!client || !_state.selectedType) return false;

    setState({ saving: true, saveError: null });
    try {
      await client.createResource(resource);
      setState({ saving: false, viewMode: 'list' });
      void resourceStore.loadResources(_state.selectedType);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create resource';
      setState({ saving: false, saveError: msg });
      return false;
    }
  },

  async updateResource(resource: FhirResource): Promise<boolean> {
    const client = serverStore.getClient();
    if (!client || !_state.selectedType) return false;

    setState({ saving: true, saveError: null });
    try {
      await client.updateResource(resource);
      setState({ saving: false, viewMode: 'list' });
      void resourceStore.loadResources(_state.selectedType);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update resource';
      setState({ saving: false, saveError: msg });
      return false;
    }
  },

  async deleteResource(id: string): Promise<boolean> {
    const client = serverStore.getClient();
    if (!client || !_state.selectedType) return false;

    try {
      await client.deleteResource(_state.selectedType, id);
      void resourceStore.loadResources(_state.selectedType);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete resource';
      setState({ saveError: msg });
      return false;
    }
  },
};
