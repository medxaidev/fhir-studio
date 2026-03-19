/**
 * JsonEditor — raw JSON editor with syntax highlighting and validation.
 *
 * @module fhir-react/JsonEditor
 */

import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import styles from './JsonEditor.module.css';

export interface JsonEditorProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function JsonEditor({ value, onChange, disabled }: JsonEditorProps): JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (newText: string) => {
      setText(newText);
      try {
        const parsed = JSON.parse(newText) as Record<string, unknown>;
        setError(null);
        onChange(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid JSON');
      }
    },
    [onChange],
  );

  return (
    <div className={styles.editor}>
      <textarea
        className={[styles.textarea, error ? styles.hasError : ''].join(' ')}
        value={text}
        onChange={(e) => handleChange(e.currentTarget.value)}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
