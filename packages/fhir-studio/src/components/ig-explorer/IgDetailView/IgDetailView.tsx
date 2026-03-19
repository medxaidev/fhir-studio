/**
 * IgDetailView — IG detail page with tab bar.
 *
 * Profiles/Extensions tabs use 3-column layout:
 * ┌──────────┬─────────────────────┬──────────┐
 * │ Nav Tree │ Profile Tree + Detail│ Raw JSON │
 * └──────────┴─────────────────────┴──────────┘
 *
 * Other tabs use 2-column layout:
 * ┌──────────────┬───────────────────────────────┐
 * │ Resource List │ Detail View                   │
 * └──────────────┴───────────────────────────────┘
 */

import { useState, useSyncExternalStore } from 'react';
import { igStore } from '../../../stores/ig-store';
import type { IgTab } from '../../../stores/ig-store';
import type { IGResourceRef } from 'fhir-rest-client';
import { Spinner } from '../../ui';
import { ProfileTreePanel } from '../ProfileTreePanel';
import { ElementDetailPanel } from '../ElementDetailPanel';
import { ProfileNavTree } from '../ProfileNavTree';
import { RawJsonPanel } from '../RawJsonPanel';
import styles from './IgDetailView.module.css';

const TABS: { key: IgTab; label: string }[] = [
  { key: 'profiles', label: 'Profiles' },
  { key: 'extensions', label: 'Extensions' },
  { key: 'valueSets', label: 'Value Sets' },
  { key: 'codeSystems', label: 'Code Systems' },
  { key: 'searchParameters', label: 'Search Params' },
];

export function IgDetailView() {
  const state = useSyncExternalStore(igStore.subscribe, igStore.getState);
  const {
    igList,
    selectedIgId,
    igIndex,
    igIndexStatus,
    activeTab,
    selectedResourceId,
    error,
  } = state;

  const [rawPanelCollapsed, setRawPanelCollapsed] = useState(false);

  const selectedIg = igList.find((ig) => ig.id === selectedIgId);
  const igTitle = selectedIg?.title || selectedIg?.name || selectedIgId || '';

  // Get items for the current tab
  const tabItems: IGResourceRef[] = igIndex
    ? (igIndex[activeTab] as IGResourceRef[]) ?? []
    : [];

  // Determine if current tab shows profile tree (profiles/extensions) or raw detail
  const isProfileTab = activeTab === 'profiles' || activeTab === 'extensions';

  return (
    <div className={styles.container}>
      {/* Breadcrumb navigation */}
      <div className={styles.header}>
        <nav className={styles.breadcrumb}>
          <button className={styles.breadcrumbLink} onClick={() => igStore.goBackToList()}>
            IG Explorer
          </button>
          <span className={styles.breadcrumbSep}>›</span>
          {selectedResourceId ? (
            <>
              <button
                className={styles.breadcrumbLink}
                onClick={() => igStore.selectResource(null)}
                title={igTitle}
              >
                {igTitle}
              </button>
              <span className={styles.breadcrumbSep}>›</span>
              <button
                className={styles.breadcrumbLink}
                onClick={() => igStore.selectResource(null)}
              >
                {TABS.find((t) => t.key === activeTab)?.label ?? activeTab}
              </button>
              <span className={styles.breadcrumbSep}>›</span>
              <span className={styles.breadcrumbCurrent}>
                {tabItems.find((r) => r.id === selectedResourceId)?.name || selectedResourceId}
              </span>
            </>
          ) : (
            <span className={styles.breadcrumbCurrent}>{igTitle}</span>
          )}
        </nav>
      </div>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map((tab) => {
          const count = igIndex ? ((igIndex[tab.key] as IGResourceRef[]) ?? []).length : 0;
          return (
            <button
              key={tab.key}
              className={[styles.tab, activeTab === tab.key ? styles.tabActive : ''].filter(Boolean).join(' ')}
              onClick={() => igStore.setActiveTab(tab.key)}
            >
              {tab.label}
              {count > 0 && <span className={styles.tabCount}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      {igIndexStatus === 'loading' && (
        <div className={styles.centered}>
          <Spinner size="md" label="Loading IG index..." />
        </div>
      )}

      {igIndexStatus === 'error' && (
        <div className={styles.centered}>
          <div className={styles.errorText}>Failed to load IG index</div>
          {error && <div className={styles.errorDetail}>{error}</div>}
        </div>
      )}

      {igIndexStatus === 'loaded' && isProfileTab && (
        /* ── Three-column layout for Profiles / Extensions ── */
        <div className={styles.threeCol}>
          {/* Left: grouped navigation tree */}
          <div className={styles.threeColNav}>
            <ProfileNavTree
              profiles={tabItems}
              selectedId={selectedResourceId}
              onSelect={(id) => igStore.selectResource(id)}
            />
          </div>

          {/* Center: profile tree + element detail */}
          <div className={styles.threeColCenter}>
            {!selectedResourceId && (
              <div className={styles.detailEmpty}>
                Select a profile from the tree
              </div>
            )}
            {selectedResourceId && (
              <div className={styles.profileColumns}>
                <ProfileTreePanel />
                <ElementDetailPanel />
              </div>
            )}
          </div>

          {/* Right: Raw JSON panel (collapsible) */}
          {selectedResourceId && (
            <RawJsonPanel
              resourceId={selectedResourceId}
              collapsed={rawPanelCollapsed}
              onToggleCollapse={() => setRawPanelCollapsed((v) => !v)}
            />
          )}
          {selectedResourceId && rawPanelCollapsed && (
            <button
              className={styles.expandBtn}
              onClick={() => setRawPanelCollapsed(false)}
              title="Show JSON panel"
            >
              ◀
            </button>
          )}
        </div>
      )}

      {igIndexStatus === 'loaded' && !isProfileTab && (
        /* ── Two-column layout for ValueSets / CodeSystems / SearchParams ── */
        <div className={styles.content}>
          {/* Left: resource list */}
          <div className={styles.resourceList}>
            {tabItems.length === 0 && (
              <div className={styles.emptyTab}>No {activeTab} in this IG</div>
            )}
            {tabItems.map((ref) => (
              <button
                key={ref.id}
                className={[
                  styles.resourceItem,
                  ref.id === selectedResourceId ? styles.resourceItemActive : '',
                ].filter(Boolean).join(' ')}
                onClick={() => igStore.selectResource(ref.id)}
                title={ref.url}
              >
                <span className={styles.resourceName}>{ref.name || ref.id}</span>
                {ref.type && <span className={styles.resourceType}>{ref.type}</span>}
              </button>
            ))}
          </div>

          {/* Right: detail view */}
          <div className={styles.detailArea}>
            {!selectedResourceId && (
              <div className={styles.detailEmpty}>
                Select a resource from the list
              </div>
            )}
            {selectedResourceId && (
              <div className={styles.rawDetail}>
                <ResourceRawDetail resourceId={selectedResourceId} tab={activeTab} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Raw resource detail for ValueSets / CodeSystems / SearchParams
// ---------------------------------------------------------------------------

interface ResourceRawDetailProps {
  resourceId: string;
  tab: IgTab;
}

function ResourceRawDetail({ resourceId, tab }: ResourceRawDetailProps) {
  const state = useSyncExternalStore(igStore.subscribe, igStore.getState);
  const { igIndex } = state;
  if (!igIndex) return null;

  const items = (igIndex[tab] as IGResourceRef[]) ?? [];
  const item = items.find((r) => r.id === resourceId);
  if (!item) return null;

  return (
    <div className={styles.rawContent}>
      <h3 className={styles.rawTitle}>{item.name || item.id}</h3>
      <div className={styles.rawMeta}>
        <div><strong>ID:</strong> {item.id}</div>
        <div><strong>URL:</strong> {item.url}</div>
        {item.type && <div><strong>Type:</strong> {item.type}</div>}
      </div>
    </div>
  );
}
