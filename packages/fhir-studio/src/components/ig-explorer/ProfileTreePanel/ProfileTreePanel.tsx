import { useSyncExternalStore } from 'react';
import { igStore } from '../../../stores/ig-store';
import { TreeNodeRow } from '../TreeNodeRow';
import { Spinner } from '../../ui';
import styles from './ProfileTreePanel.module.css';

export function ProfileTreePanel() {
  const state = useSyncExternalStore(igStore.subscribe, igStore.getState);
  const { treeNodes, treeStatus, selectedProfileId, selectedNodeId, error } = state;

  // Empty state: no profile selected
  if (!selectedProfileId) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No profile selected</p>
          <p className={styles.emptyHint}>Select a profile from the left panel to view its element tree.</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (treeStatus === 'loading') {
    return (
      <div className={styles.panel}>
        <div className={styles.centered}>
          <Spinner size="md" label="Building element tree..." />
        </div>
      </div>
    );
  }

  // Error state
  if (treeStatus === 'error') {
    return (
      <div className={styles.panel}>
        <div className={styles.errorBox}>
          <p className={styles.errorTitle}>Failed to load profile</p>
          <p className={styles.errorMessage}>{error}</p>
        </div>
      </div>
    );
  }

  // Loaded but empty
  if (treeNodes.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Empty profile</p>
          <p className={styles.emptyHint}>This StructureDefinition has no elements in its snapshot.</p>
        </div>
      </div>
    );
  }

  // Render tree
  return (
    <div className={styles.panel}>
      <div className={styles.treeHeader}>
        <span className={styles.treeTitle}>{selectedProfileId}</span>
        <span className={styles.treeCount}>{countNodes(treeNodes)} elements</span>
      </div>
      <div className={styles.treeBody} role="tree">
        {treeNodes.map((node) => (
          <TreeNodeRow key={node.id} node={node} selectedNodeId={selectedNodeId} />
        ))}
      </div>
    </div>
  );
}

function countNodes(nodes: { children?: { children?: unknown[] }[] }[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children) {
      count += countNodes(node.children as typeof nodes);
    }
  }
  return count;
}
