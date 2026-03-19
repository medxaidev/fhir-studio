/**
 * ResourceFormView — Create/Edit form with Form|JSON toggle.
 */

import { useState, useMemo } from 'react';
import type { JSX } from 'react';
import type { FhirResource, ProfileEntry } from 'fhir-rest-client';
import type { ParsedSchema } from '../../components/fhir-react/types/schema-types';
import { ElementsContext, SchemaServiceContext } from '../../components/fhir-react/context/SchemaContext';
import { ElementsInput } from '../../components/fhir-react/ElementsInput';
import { serverStore } from '../../stores/server-store';
import { SchemaService } from '../../services/schema-service';
import { JsonEditor } from '../../components/fhir-react/JsonEditor';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import styles from './ResourcesPage.module.css';

type EditorMode = 'form' | 'json';

export interface ResourceFormViewProps {
  mode: 'create' | 'edit';
  resourceType: string;
  resource: FhirResource;
  schema: ParsedSchema | null;
  schemaLoading: boolean;
  schemaError: string | null;
  saving: boolean;
  saveError: string | null;
  availableProfiles: ProfileEntry[];
  selectedProfileUrl: string | null;
  onProfileChange: (profileUrl: string) => void;
  onSave: (resource: FhirResource) => void;
  onCancel: () => void;
}

export function ResourceFormView({
  mode,
  resourceType,
  resource,
  schema,
  schemaLoading,
  schemaError,
  saving,
  saveError,
  availableProfiles,
  selectedProfileUrl,
  onProfileChange,
  onSave,
  onCancel,
}: ResourceFormViewProps): JSX.Element {
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const [formValue, setFormValue] = useState<Record<string, unknown>>(
    resource as Record<string, unknown>,
  );

  const schemaService = useMemo(() => {
    const client = serverStore.getClient();
    return client ? new SchemaService(client) : null;
  }, []);

  const contextValue = useMemo(() => {
    if (!schema) return null;
    return {
      path: resourceType,
      profileUrl: schema.url,
      elements: schema.elements,
      allElements: schema.allElements,
    };
  }, [schema, resourceType]);

  const handleSave = () => {
    onSave(formValue as FhirResource);
  };

  const title = mode === 'create' ? `Create ${resourceType}` : `Edit ${resourceType}/${resource.id}`;

  return (
    <div className={styles.formView}>
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={onCancel}>
          ← Back
        </button>
        <h2 className={styles.viewTitle}>{title}</h2>
        <div className={styles.spacer} />
        {availableProfiles.length > 1 && (
          <select
            className={styles.profileSelect}
            value={selectedProfileUrl ?? ''}
            onChange={(e) => onProfileChange(e.currentTarget.value)}
            disabled={saving}
          >
            {availableProfiles.map((p) => (
              <option key={p.url} value={p.url}>
                {p.title}{p.isBase ? ' (Base)' : ''}
              </option>
            ))}
          </select>
        )}
        {availableProfiles.length === 1 && selectedProfileUrl && (
          <span className={styles.profileLabel}>
            {availableProfiles[0].title}
          </span>
        )}
        <div className={styles.toggleGroup}>
          <button
            className={[styles.toggleBtn, editorMode === 'form' ? styles.active : ''].join(' ')}
            onClick={() => setEditorMode('form')}
          >
            Form
          </button>
          <button
            className={[styles.toggleBtn, editorMode === 'json' ? styles.active : ''].join(' ')}
            onClick={() => setEditorMode('json')}
          >
            JSON
          </button>
        </div>
      </div>

      {saveError && <p className={styles.error}>{saveError}</p>}

      <div className={styles.formContent}>
        {editorMode === 'json' ? (
          <JsonEditor
            value={formValue}
            onChange={setFormValue}
            disabled={saving}
          />
        ) : schemaLoading ? (
          <div className={styles.center}>
            <Spinner size="md" />
            <p>Loading schema...</p>
          </div>
        ) : schemaError ? (
          <div className={styles.center}>
            <p className={styles.error}>{schemaError}</p>
            <p className={styles.muted}>Try the JSON editor instead.</p>
          </div>
        ) : contextValue ? (
          <SchemaServiceContext.Provider value={schemaService}>
            <ElementsContext.Provider value={contextValue}>
              <ElementsInput
                type={resourceType}
                path={resourceType}
                defaultValue={formValue}
                onChange={setFormValue}
              />
            </ElementsContext.Provider>
          </SchemaServiceContext.Provider>
        ) : (
          <div className={styles.center}>
            <p className={styles.muted}>No schema available. Use JSON editor.</p>
          </div>
        )}
      </div>

      <div className={styles.formFooter}>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
