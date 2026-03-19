/**
 * IgListView — IG list page showing all loaded IGs as cards.
 * Click a card to enter the IG detail view.
 */

import { useSyncExternalStore } from 'react';
import { igStore } from '../../../stores/ig-store';
import { Spinner } from '../../ui';
import { PackageIcon } from '../../icons';
import styles from './IgListView.module.css';

export function IgListView() {
  const state = useSyncExternalStore(igStore.subscribe, igStore.getState);
  const { igList, igListStatus, error } = state;

  if (igListStatus === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.centered}>
          <Spinner size="md" label="Loading IGs..." />
        </div>
      </div>
    );
  }

  if (igListStatus === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.centered}>
          <div className={styles.errorText}>Failed to load IGs</div>
          {error && <div className={styles.errorDetail}>{error}</div>}
        </div>
      </div>
    );
  }

  if (igList.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.centered}>
          <div className={styles.emptyText}>No Implementation Guides loaded</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <PackageIcon className={styles.headerIcon} />
        <h2 className={styles.headerTitle}>Implementation Guides</h2>
      </div>
      <div className={styles.grid}>
        {igList.map((ig) => (
          <button
            key={ig.id}
            className={styles.card}
            onClick={() => igStore.enterIG(ig.id)}
          >
            <div className={styles.cardName}>{ig.title || ig.name}</div>
            <div className={styles.cardMeta}>
              <span className={styles.cardVersion}>v{ig.version}</span>
              <span className={styles.cardStatus}>{ig.status}</span>
            </div>
            <div className={styles.cardId}>{ig.id}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
