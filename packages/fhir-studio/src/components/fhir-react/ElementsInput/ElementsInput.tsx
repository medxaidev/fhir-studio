/**
 * ElementsInput — iterates over all elements in the current context
 * and renders FormSection + ResourcePropertyInput for each.
 *
 * Handles extension slice data mapping: extension slices are stored in the
 * resource's `extension[]` array by URL, but rendered as named form fields.
 *
 * State management follows Medplum's pattern:
 * - Each ElementsInput owns its local state (shallow copy of the sub-object)
 * - `setValueWrapper` calls both local `setValue` AND `props.onChange`
 * - `setPropertyValue` handles choice type key cleanup
 * - Parent receives the full updated sub-object via onChange
 *
 * @module fhir-react/ElementsInput
 */

import { useContext, useState, useMemo } from 'react';
import type { JSX } from 'react';
import type { InternalSchemaElement } from '../types/schema-types';
import { ElementsContext, ValidationContext } from '../context/SchemaContext';
import { FormSection } from '../FormSection/FormSection';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { getElementsToRender } from '../utils/schema-utils';
import { setPropertyValue } from '../utils/property-utils';
import { capitalize } from '../utils/type-utils';
import type { ValidationIssue } from '../utils/validation-utils';
import styles from './ElementsInput.module.css';

export interface ElementsInputProps {
  type: string;
  path: string;
  defaultValue: Record<string, unknown>;
  onChange?: (value: Record<string, unknown>) => void;
}

// ─── Choice type value helpers ───────────────────────────────────────────────

/**
 * For choice type elements (name ends with [x]), find the actual key and value
 * in the resource object. e.g. deceased[x] → look for deceasedBoolean, deceasedDateTime, etc.
 */
function resolveChoiceValue(
  obj: Record<string, unknown>,
  element: InternalSchemaElement,
): unknown {
  const baseName = element.name.replace('[x]', '');
  for (const t of element.type) {
    const key = baseName + capitalize(t.code);
    if (key in obj) return obj[key];
  }
  return undefined;
}

// ─── Extension slice helpers ─────────────────────────────────────────────────

interface ExtRecord { url?: string;[k: string]: unknown }

/** Get the extension URL from the element's type profile. */
function getExtensionUrl(element: InternalSchemaElement): string | undefined {
  return element.type[0]?.profile?.[0];
}

/** Read an extension value from the resource's extension array. */
function readExtensionValue(
  extensions: ExtRecord[] | undefined,
  url: string,
  isArray: boolean,
): unknown {
  if (!extensions || !Array.isArray(extensions)) return isArray ? [] : undefined;
  const matches = extensions.filter((e) => e.url === url);
  if (isArray) return matches;
  return matches[0];
}

/** Write an extension value back into the extension array (immutably). */
function writeExtensionValue(
  extensions: ExtRecord[] | undefined,
  url: string,
  newValue: unknown,
  isArray: boolean,
): ExtRecord[] | undefined {
  const existing = Array.isArray(extensions) ? [...extensions] : [];

  // Remove existing entries for this URL
  const filtered = existing.filter((e) => e.url !== url);

  if (isArray) {
    const items = Array.isArray(newValue) ? newValue : [];
    // Ensure each item has the url
    const withUrl = items.map((item: ExtRecord) => ({ ...item, url }));
    const result = [...filtered, ...withUrl];
    return result.length > 0 ? result : undefined;
  }

  // Single value
  if (newValue == null || (typeof newValue === 'object' && Object.keys(newValue as object).length === 0)) {
    return filtered.length > 0 ? filtered : undefined;
  }

  const entry = { ...(newValue as ExtRecord), url };
  return [...filtered, entry];
}

// ─── Field-level validation helper ───────────────────────────────────────────

/**
 * Find the first error message for a given field path from the validation issues list.
 * For choice types (e.g. Patient.deceased[x]), matches any expanded variant
 * (e.g. Patient.deceasedBoolean, Patient.deceasedDateTime).
 */
function getFieldError(
  issues: ValidationIssue[],
  fieldPath: string,
  element: InternalSchemaElement,
): string | undefined {
  if (!issues || issues.length === 0) return undefined;

  // Direct match
  const direct = issues.find((i) => i.path === fieldPath && i.severity === 'error');
  if (direct) return direct.message;

  // Choice type: match expanded paths (e.g. Patient.value[x] → Patient.valueString)
  if (fieldPath.includes('[x]')) {
    const basePath = fieldPath.replace('[x]', '');
    for (const t of element.type) {
      const expanded = basePath + capitalize(t.code);
      const match = issues.find((i) => i.path === expanded && i.severity === 'error');
      if (match) return match.message;
    }
  }

  // Match child errors (e.g. Patient.name has errors at Patient.name.family)
  const childErrors = issues.filter((i) => i.path.startsWith(fieldPath + '.') && i.severity === 'error');
  if (childErrors.length > 0) {
    return `${childErrors.length} issue${childErrors.length > 1 ? 's' : ''} in nested fields`;
  }

  return undefined;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ElementsInput(props: ElementsInputProps): JSX.Element {
  const [value, setValue] = useState<Record<string, unknown>>(props.defaultValue ?? {});
  const ctx = useContext(ElementsContext);
  const validationIssues = useContext(ValidationContext);

  const elementsToRender = useMemo(() => {
    const entries = getElementsToRender(ctx.elements);
    // Sort: extension slices go to the bottom (stable sort — preserves original order)
    return [...entries].sort(([, a], [, b]) => {
      const aExt = a.sliceName ? 1 : 0;
      const bExt = b.sliceName ? 1 : 0;
      return aExt - bExt;
    });
  }, [ctx.elements]);

  /**
   * Central state update — Medplum pattern:
   * 1. Shallow-copy current value
   * 2. Apply property change
   * 3. Set local state AND propagate to parent
   */
  function setValueWrapper(newValue: Record<string, unknown>): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <div className={styles.elements}>
      {elementsToRender.map(([key, element]) => {
        const isExtSlice = !!element.sliceName;
        const extUrl = isExtSlice ? getExtensionUrl(element) : undefined;

        // Read value: extension slices read from extension[] array
        let fieldValue: unknown;
        if (isExtSlice && extUrl) {
          fieldValue = readExtensionValue(
            value.extension as ExtRecord[] | undefined,
            extUrl,
            element.isArray,
          );
        } else if (element.name.includes('[x]')) {
          fieldValue = resolveChoiceValue(value, element);
        } else {
          fieldValue = value[key];
        }

        const required = element.min > 0;
        const displayName = isExtSlice
          ? (element.description ?? formatDisplayName(key))
          : formatDisplayName(key);

        return (
          <FormSection
            key={key}
            title={displayName}
            description={isExtSlice ? undefined : element.description}
            htmlFor={key}
            required={required}
            readonly={element.readonly}
            error={getFieldError(validationIssues, `${props.path}.${key}`, element)}
          >
            <ResourcePropertyInput
              element={element}
              path={`${props.path}.${key}`}
              value={fieldValue}
              onChange={(newFieldValue, propName) => {
                if (isExtSlice) {
                  // Extension slice: write into extension[] array
                  const url = getExtensionUrl(element);
                  if (!url) return;
                  const exts = value.extension as ExtRecord[] | undefined;
                  const updated = writeExtensionValue(exts, url, newFieldValue, element.isArray);
                  const next = { ...value, extension: updated };
                  if (!next.extension) delete next.extension;
                  setValueWrapper(next);
                } else {
                  // Normal property: use setPropertyValue for choice type handling
                  setValueWrapper(
                    setPropertyValue({ ...value }, key, propName ?? key, newFieldValue),
                  );
                }
              }}
            />
          </FormSection>
        );
      })}
    </div>
  );
}

function formatDisplayName(key: string): string {
  // Convert camelCase to Title Case with spaces
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/\[x\]$/, ' (choice)')
    .trim();
}
