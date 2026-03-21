/**
 * JsonEditor — raw JSON editor with FHIR schema validation.
 *
 * Displays:
 * - JSON parse errors (syntax)
 * - FHIR validation issues (unknown props, missing required, etc.)
 *
 * @module fhir-react/JsonEditor
 */

import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import type { ValidationIssue } from '../utils/validation-utils';
import styles from './JsonEditor.module.css';

export interface JsonEditorProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  validationIssues?: ValidationIssue[];
  disabled?: boolean;
}

export function JsonEditor({ value, onChange, validationIssues, disabled }: JsonEditorProps): JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  const handleChange = useCallback(
    (newText: string) => {
      setText(newText);
      try {
        const parsed = JSON.parse(newText) as Record<string, unknown>;
        setParseError(null);
        onChange(parsed);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Invalid JSON');
      }
    },
    [onChange],
  );

  const hasErrors = !!parseError || (validationIssues && validationIssues.some((i) => i.severity === 'error'));

  return (
    <div className={styles.editor}>
      <textarea
        className={[styles.textarea, hasErrors ? styles.hasError : ''].join(' ')}
        value={text}
        onChange={(e) => handleChange(e.currentTarget.value)}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      {parseError && <div className={styles.error}>{parseError}</div>}
      {!parseError && validationIssues && validationIssues.length > 0 && (
        <div className={styles.issues}>
          <div className={styles.issuesHeader}>
            Validation Issues ({validationIssues.length})
          </div>
          <ul className={styles.issuesList}>
            {validationIssues.map((issue, i) => (
              <li key={i} className={styles[issue.severity] ?? styles.error}>
                <span className={styles.issuePath}>{issue.path}</span>
                <span className={styles.issueMsg}>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
