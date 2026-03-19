/**
 * ResourceTypesView — displays a searchable grid of resource types.
 */

import { useState, useMemo } from 'react';
import type { JSX } from 'react';
import { Spinner } from '../../components/ui/Spinner';
import styles from './ResourcesPage.module.css';

export interface ResourceTypesViewProps {
  types: string[];
  loading: boolean;
  error: string | null;
  onSelect: (type: string) => void;
}

export function ResourceTypesView({ types, loading, error, onSelect }: ResourceTypesViewProps): JSX.Element {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return types;
    const q = search.toLowerCase();
    return types.filter((t) => t.toLowerCase().includes(q));
  }, [types, search]);

  if (loading) {
    return (
      <div className={styles.center}>
        <Spinner size="md" />
        <p>Loading resource types...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.center}>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.typesView}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search resource types..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <span className={styles.count}>{filtered.length} types</span>
      </div>
      <div className={styles.typesGrid}>
        {filtered.map((type) => (
          <button
            key={type}
            className={styles.typeCard}
            onClick={() => onSelect(type)}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
