/**
 * CodingInput — Coding complex type (system + code + display).
 *
 * When a ValueSet binding is available, renders a searchable Combobox
 * that expands the ValueSet. Otherwise falls back to raw text fields.
 */

import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import type { BindingDef } from '../types/schema-types';
import { Combobox } from '../../ui/Combobox';
import type { ComboboxOption } from '../../ui/Combobox';
import { TextInput } from '../../ui/TextInput';
import { expandValueSet } from '../utils/valueset-utils';
import type { ExpandedConcept } from '../utils/valueset-utils';

export interface CodingInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  binding?: BindingDef;
  disabled?: boolean;
}

export function CodingInput({ value, onChange, binding, disabled }: CodingInputProps): JSX.Element {
  const v = value ?? {};
  const [concepts, setConcepts] = useState<ExpandedConcept[]>([]);
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!binding?.valueSet) return;

    setLoading(true);
    expandValueSet(binding.valueSet, 300)
      .then((entries) => {
        setConcepts(entries);
        setOptions(
          entries.map((c) => ({
            value: c.code ?? '',
            label: c.display || c.code || '',
            description: c.system,
          })),
        );
      })
      .catch(() => {
        setConcepts([]);
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [binding?.valueSet]);

  // If we have expanded concepts, use Combobox
  if (binding?.valueSet && (options.length > 0 || loading)) {
    const currentCode = (v.code as string) ?? '';
    return (
      <Combobox
        options={options}
        value={currentCode}
        onChange={(code) => {
          if (!code) {
            onChange(undefined);
            return;
          }
          const concept = concepts.find((c) => c.code === code);
          onChange({
            system: concept?.system ?? (v.system as string),
            code,
            display: concept?.display ?? code,
          });
        }}
        loading={loading}
        disabled={disabled}
        creatable={binding.strength !== 'required'}
        clearable={binding.strength !== 'required'}
        placeholder="Select coding..."
      />
    );
  }

  // Fallback: raw text fields
  const update = (field: string, val: string) => {
    onChange({ ...v, [field]: val || undefined });
  };

  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <TextInput
        value={(v.system as string) ?? ''}
        onChange={(s) => update('system', s)}
        placeholder="system"
        disabled={disabled}
      />
      <TextInput
        value={(v.code as string) ?? ''}
        onChange={(c) => update('code', c)}
        placeholder="code"
        disabled={disabled}
      />
      <TextInput
        value={(v.display as string) ?? ''}
        onChange={(d) => update('display', d)}
        placeholder="display"
        disabled={disabled}
      />
    </div>
  );
}
