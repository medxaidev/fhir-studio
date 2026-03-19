/**
 * ResourceListView — shows a list of resource instances with create/delete actions.
 */

import { useState } from 'react';
import type { JSX } from 'react';
import type { FhirResource } from 'fhir-rest-client';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import styles from './ResourcesPage.module.css';

export interface ResourceListViewProps {
  resourceType: string;
  resources: FhirResource[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onCreate: () => void;
  onEdit: (resource: FhirResource) => void;
  onDelete: (id: string) => Promise<boolean>;
}

export function ResourceListView({
  resourceType,
  resources,
  loading,
  error,
  onBack,
  onCreate,
  onEdit,
  onDelete,
}: ResourceListViewProps): JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await onDelete(deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <div className={styles.listView}>
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <h2 className={styles.viewTitle}>{resourceType}</h2>
        <span className={styles.count}>{resources.length} resources</span>
        <div className={styles.spacer} />
        <Button variant="primary" onClick={onCreate}>
          + Create
        </Button>
      </div>

      {loading && (
        <div className={styles.center}>
          <Spinner size="md" />
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {!loading && resources.length === 0 && !error && (
        <div className={styles.center}>
          <p className={styles.muted}>No {resourceType} resources found.</p>
        </div>
      )}

      {resources.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Last Updated</th>
              <th>Version</th>
              <th className={styles.actions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => {
              const meta = r.meta as Record<string, unknown> | undefined;
              return (
                <tr key={r.id}>
                  <td className={styles.idCell}>{r.id}</td>
                  <td>{meta?.lastUpdated ? String(meta.lastUpdated) : '—'}</td>
                  <td>{meta?.versionId ? String(meta.versionId) : '—'}</td>
                  <td className={styles.actions}>
                    <button className={styles.actionBtn} onClick={() => onEdit(r)}>
                      Edit
                    </button>
                    <button
                      className={[styles.actionBtn, styles.deleteBtn].join(' ')}
                      onClick={() => setDeleteTarget(r.id ?? null)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Resource"
        message={`Are you sure you want to delete ${resourceType}/${deleteTarget}? This action cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
