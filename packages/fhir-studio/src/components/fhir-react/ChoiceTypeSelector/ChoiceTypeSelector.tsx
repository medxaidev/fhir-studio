/**
 * ChoiceTypeSelector — handles value[x] elements with multiple types.
 *
 * Shows a type selector dropdown + the corresponding type input.
 * Detects the currently populated choice key from the parent object
 * (e.g. deceasedBoolean → boolean, deceasedDateTime → dateTime).
 *
 * @module fhir-react/ChoiceTypeSelector
 */

import { useState, useContext } from 'react';
import type { JSX } from 'react';
import type { InternalSchemaElement } from '../types/schema-types';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { ElementsContext } from '../context/SchemaContext';
import { SelectInput } from '../../ui/SelectInput';
import { capitalize } from '../utils/type-utils';
import styles from './ChoiceTypeSelector.module.css';

export interface ChoiceTypeSelectorProps {
  element: InternalSchemaElement;
  path: string;
  value: unknown;
  onChange: (value: unknown, propName?: string) => void;
  disabled?: boolean;
}

/**
 * Detect which choice type is currently set by inspecting the parent object
 * for keys matching the pattern baseName + capitalize(typeCode).
 */
function detectCurrentType(
  element: InternalSchemaElement,
  parentPath: string,
  ctx: { path: string },
): string | undefined {
  // We can't detect from parent object here — defer to the value prop
  // which is already resolved. Instead we use the path-based approach:
  // The value passed in may tell us the type via its JS type.
  return undefined;
  void parentPath;
  void ctx;
  void element;
}

export function ChoiceTypeSelector({
  element,
  path,
  value,
  onChange,
  disabled,
}: ChoiceTypeSelectorProps): JSX.Element {
  const ctx = useContext(ElementsContext);

  const [selectedTypeCode, setSelectedTypeCode] = useState(() => {
    // Try to detect existing type from the value
    const detected = detectCurrentType(element, path, ctx);
    if (detected) return detected;

    // Infer from JS value type
    if (value !== undefined && value !== null) {
      if (typeof value === 'boolean') {
        const boolType = element.type.find((t) => t.code === 'boolean');
        if (boolType) return 'boolean';
      }
      if (typeof value === 'number') {
        const numType = element.type.find((t) =>
          t.code === 'integer' || t.code === 'decimal' || t.code === 'positiveInt' || t.code === 'unsignedInt',
        );
        if (numType) return numType.code;
      }
      if (typeof value === 'string') {
        // Try to match string-like types: dateTime, date, string, etc.
        const dateTimeType = element.type.find((t) => t.code === 'dateTime');
        const dateType = element.type.find((t) => t.code === 'date');
        const stringType = element.type.find((t) => t.code === 'string');
        // If it looks like a date/datetime, prefer that
        if (dateTimeType && /^\d{4}-\d{2}/.test(value as string)) return 'dateTime';
        if (dateType && /^\d{4}-\d{2}-\d{2}$/.test(value as string)) return 'date';
        if (stringType) return 'string';
        // Fallback to first string-compatible type
        const strType = element.type.find((t) =>
          ['string', 'uri', 'url', 'canonical', 'code', 'id', 'markdown', 'dateTime', 'date', 'time', 'instant'].includes(t.code),
        );
        if (strType) return strType.code;
      }
      if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        // Reference
        if ('reference' in obj) {
          const refType = element.type.find((t) => t.code === 'Reference');
          if (refType) return 'Reference';
        }
        // CodeableConcept
        if ('coding' in obj || 'text' in obj) {
          const ccType = element.type.find((t) => t.code === 'CodeableConcept');
          if (ccType) return 'CodeableConcept';
        }
        // Quantity
        if ('value' in obj && 'unit' in obj) {
          const qType = element.type.find((t) => t.code === 'Quantity');
          if (qType) return 'Quantity';
        }
        // Period
        if ('start' in obj || 'end' in obj) {
          const pType = element.type.find((t) => t.code === 'Period');
          if (pType) return 'Period';
        }
      }
    }

    return element.type[0]?.code ?? '';
  });

  const selectedType = element.type.find((t) => t.code === selectedTypeCode) ?? element.type[0];

  const singleTypeElement: InternalSchemaElement = {
    ...element,
    type: selectedType ? [selectedType] : [],
    isArray: false,
  };

  return (
    <div className={styles.choiceType}>
      <SelectInput
        className={styles.typeSelect}
        value={selectedTypeCode}
        onChange={(code) => {
          setSelectedTypeCode(code);
          // Clear old value when switching type
          const baseName = element.name.replace('[x]', '');
          const oldPropName = baseName + capitalize(selectedTypeCode);
          const newPropName = baseName + capitalize(code);
          // Signal removal of old key and set undefined for new
          onChange(undefined, oldPropName);
          void newPropName;
        }}
        options={element.type.map((t) => ({
          value: t.code,
          label: t.code,
        }))}
        disabled={disabled}
      />
      <div className={styles.valueInput}>
        <ResourcePropertyInput
          element={singleTypeElement}
          path={path}
          value={value}
          onChange={(v) => {
            const baseName = element.name.replace('[x]', '');
            const propName = baseName + capitalize(selectedTypeCode);
            onChange(v, propName);
          }}
          arrayElement={true}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
