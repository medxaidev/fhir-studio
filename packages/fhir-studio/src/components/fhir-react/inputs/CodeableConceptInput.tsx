/**
 * CodeableConceptInput — CodeableConcept (text + coding[]).
 *
 * When a binding is available, the primary CodingInput renders a Combobox.
 * Selecting a concept auto-fills both coding[0] and text.
 */

import type { JSX } from 'react';
import type { BindingDef } from '../types/schema-types';
import { TextInput } from '../../ui/TextInput';
import { CodingInput } from './CodingInput';

export interface CodeableConceptInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  binding?: BindingDef;
  disabled?: boolean;
}

export function CodeableConceptInput({ value, onChange, binding, disabled }: CodeableConceptInputProps): JSX.Element {
  const v = value ?? {};
  const coding = (v.coding as Record<string, unknown>[]) ?? [{}];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <CodingInput
        value={coding[0] ?? {}}
        onChange={(newCoding) => {
          if (!newCoding) {
            onChange(undefined);
            return;
          }
          const c = newCoding as Record<string, unknown>;
          const newCodings = [...coding];
          newCodings[0] = c;
          // Auto-fill text from display if present
          const text = (c.display as string) || (v.text as string);
          onChange({ ...v, coding: newCodings, ...(text ? { text } : {}) });
        }}
        binding={binding}
        disabled={disabled}
      />
      <TextInput
        value={(v.text as string) ?? ''}
        onChange={(text) => onChange({ ...v, text: text || undefined })}
        placeholder="text"
        disabled={disabled}
      />
    </div>
  );
}
