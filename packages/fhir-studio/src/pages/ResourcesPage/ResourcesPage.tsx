import { useEffect, useSyncExternalStore, useRef } from 'react';
import { DatabaseIcon } from '../../components/icons';
import { serverStore } from '../../stores/server-store';
import { resourceStore } from '../../stores/resource-store';
import { ResourceTypesView } from './ResourceTypesView';
import { ResourceListView } from './ResourceListView';
import { ResourceFormView } from './ResourceFormView';
import styles from './ResourcesPage.module.css';

export function ResourcesPage() {
  const serverState = useSyncExternalStore(serverStore.subscribe, serverStore.getState);
  const state = useSyncExternalStore(resourceStore.subscribe, resourceStore.getState);
  const prevServerId = useRef(serverState.currentServerId);

  // Reset store on server change
  useEffect(() => {
    if (prevServerId.current !== serverState.currentServerId) {
      resourceStore.reset();
      prevServerId.current = serverState.currentServerId;
    }
  }, [serverState.currentServerId]);

  // Auto-load resource types when connected
  useEffect(() => {
    if (
      serverState.connectionStatus === 'connected' &&
      state.viewMode === 'types' &&
      state.resourceTypes.length === 0 &&
      !state.resourceTypesLoading
    ) {
      void resourceStore.loadResourceTypes();
    }
  }, [serverState.connectionStatus, state.viewMode, state.resourceTypes.length, state.resourceTypesLoading]);

  // Not connected — show placeholder
  if (serverState.connectionStatus !== 'connected') {
    return (
      <div className={styles.page}>
        <div className={styles.placeholder}>
          <DatabaseIcon width={48} height={48} />
          <h2 className={styles.placeholderTitle}>Resource Explorer</h2>
          <p className={styles.placeholderDesc}>
            Connect to a FHIR server first to browse and manage resources.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {state.viewMode === 'types' && (
        <ResourceTypesView
          types={state.resourceTypes}
          loading={state.resourceTypesLoading}
          error={state.resourceTypesError}
          onSelect={(type) => resourceStore.goToList(type)}
        />
      )}

      {state.viewMode === 'list' && state.selectedType && (
        <ResourceListView
          resourceType={state.selectedType}
          resources={state.resources}
          loading={state.resourcesLoading}
          error={state.resourcesError}
          onBack={() => resourceStore.goToTypes()}
          onCreate={() => resourceStore.goToCreate()}
          onEdit={(r) => resourceStore.goToEdit(r)}
          onDelete={(id) => resourceStore.deleteResource(id)}
        />
      )}

      {(state.viewMode === 'create' || state.viewMode === 'edit') &&
        state.selectedType &&
        state.editingResource && (
          <ResourceFormView
            mode={state.viewMode}
            resourceType={state.selectedType}
            resource={state.editingResource}
            schema={state.schema}
            schemaLoading={state.schemaLoading}
            schemaError={state.schemaError}
            saving={state.saving}
            saveError={state.saveError}
            availableProfiles={state.availableProfiles}
            selectedProfileUrl={state.selectedProfileUrl}
            onProfileChange={(url) => resourceStore.selectProfile(url)}
            onSave={(r) => {
              if (state.viewMode === 'create') {
                void resourceStore.createResource(r);
              } else {
                void resourceStore.updateResource(r);
              }
            }}
            onCancel={() => {
              if (state.selectedType) {
                resourceStore.goToList(state.selectedType);
              }
            }}
          />
        )}
    </div>
  );
}
