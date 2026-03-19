import { useSyncExternalStore } from 'react';
import { igStore } from '../../../stores/ig-store';
import type { IGResourceRef } from 'fhir-rest-client';
import { Spinner } from '../../ui';
import { PackageIcon } from '../../icons';
import styles from './IgNavigator.module.css';

export function IgNavigator() {
  const state = useSyncExternalStore(igStore.subscribe, igStore.getState);

  const {
    igList,
    igListStatus,
    selectedIgId,
    igIndex,
    igIndexStatus,
    selectedProfileId,
  } = state;

  const handleIgChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const igId = e.target.value;
    if (igId) {
      igStore.selectIG(igId);
    }
  };

  const handleProfileClick = (ref: IGResourceRef) => {
    igStore.selectProfile(ref.id);
  };

  return (
    <aside className={styles.navigator}>
      <div className={styles.header}>
        <PackageIcon className={styles.headerIcon} />
        <span className={styles.headerTitle}>IG Explorer</span>
      </div>

      {/* IG Selector */}
      <div className={styles.section}>
        <label className={styles.label} htmlFor="ig-select">
          Implementation Guide
        </label>
        {igListStatus === 'loading' && (
          <div className={styles.centered}>
            <Spinner size="sm" />
          </div>
        )}
        {igListStatus === 'error' && (
          <div className={styles.errorText}>Failed to load IGs</div>
        )}
        {igListStatus === 'loaded' && igList.length === 0 && (
          <div className={styles.emptyText}>No IGs available</div>
        )}
        {igListStatus === 'loaded' && igList.length > 0 && (
          <select
            id="ig-select"
            className={styles.select}
            value={selectedIgId ?? ''}
            onChange={handleIgChange}
          >
            <option value="">Select an IG...</option>
            {igList.map((ig) => (
              <option key={ig.id} value={ig.id}>
                {ig.title || ig.name} ({ig.version})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* IG Index Content */}
      {selectedIgId && (
        <div className={styles.indexContent}>
          {igIndexStatus === 'loading' && (
            <div className={styles.centered}>
              <Spinner size="sm" label="Loading index..." />
            </div>
          )}
          {igIndexStatus === 'error' && (
            <div className={styles.errorText}>Failed to load IG index</div>
          )}
          {igIndexStatus === 'loaded' && igIndex && (
            <>
              <ResourceGroup
                title="Profiles"
                items={igIndex.profiles}
                selectedId={selectedProfileId}
                onItemClick={handleProfileClick}
              />
              <ResourceGroup
                title="Extensions"
                items={igIndex.extensions}
                selectedId={selectedProfileId}
                onItemClick={handleProfileClick}
              />
              <ResourceGroup
                title="Value Sets"
                items={igIndex.valueSets}
                selectedId={null}
                onItemClick={() => { }}
              />
              <ResourceGroup
                title="Code Systems"
                items={igIndex.codeSystems}
                selectedId={null}
                onItemClick={() => { }}
              />
            </>
          )}
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ResourceGroup
// ---------------------------------------------------------------------------

interface ResourceGroupProps {
  title: string;
  items: IGResourceRef[];
  selectedId: string | null;
  onItemClick: (ref: IGResourceRef) => void;
}

function ResourceGroup({ title, items, selectedId, onItemClick }: ResourceGroupProps) {
  if (items.length === 0) return null;

  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>
        {title}
        <span className={styles.groupCount}>{items.length}</span>
      </div>
      <ul className={styles.groupList}>
        {items.map((ref) => (
          <li key={ref.id}>
            <button
              className={[
                styles.resourceItem,
                ref.id === selectedId ? styles.resourceItemActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onItemClick(ref)}
              title={ref.url}
            >
              {ref.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
