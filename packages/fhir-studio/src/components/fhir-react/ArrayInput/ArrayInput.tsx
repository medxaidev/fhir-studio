/**
 * ArrayInput — wraps array fields (max="*") with add/remove controls.
 *
 * @module fhir-react/ArrayInput
 */

import type { JSX } from 'react';
import type { InternalSchemaElement } from '../types/schema-types';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import styles from './ArrayInput.module.css';

export interface ArrayInputProps {
  element: InternalSchemaElement;
  path: string;
  value: unknown[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function ArrayInput({
  element,
  path,
  value,
  onChange,
  disabled,
}: ArrayInputProps): JSX.Element {
  const items = Array.isArray(value) ? value : [];

  const handleAdd = () => {
    onChange([...items, undefined]);
  };

  const handleRemove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : undefined);
  };

  const handleChange = (index: number, newValue: unknown) => {
    const next = [...items];
    next[index] = newValue;
    onChange(next);
  };

  return (
    <div className={styles.array}>
      {items.map((item, index) => (
        <div key={index} className={styles.item}>
          <div className={styles.itemContent}>
            <ResourcePropertyInput
              element={element}
              path={`${path}[${index}]`}
              value={item}
              onChange={(v) => handleChange(index, v)}
              arrayElement={true}
              disabled={disabled}
            />
          </div>
          {!disabled && !element.readonly && (
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => handleRemove(index)}
              title={`Remove ${element.name}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!disabled && !element.readonly && (
        <button
          type="button"
          className={styles.addBtn}
          onClick={handleAdd}
        >
          + Add {element.name}
        </button>
      )}
    </div>
  );
}
