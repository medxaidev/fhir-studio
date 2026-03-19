/**
 * CodeInput — code type with ValueSet binding → Combobox dropdown.
 */

import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import type { BindingDef } from '../types/schema-types';
import { Combobox } from '../../ui/Combobox';
import type { ComboboxOption } from '../../ui/Combobox';
import { TextInput } from '../../ui/TextInput';
import { expandValueSet } from '../utils/valueset-utils';

export interface CodeInputProps {
  binding: BindingDef;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CodeInput({ binding, value, onChange, disabled }: CodeInputProps): JSX.Element {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!binding.valueSet) return;

    setLoading(true);
    expandValueSet(binding.valueSet, 200)
      .then((entries) => {
        setOptions(
          entries.map((c) => ({
            value: c.code ?? '',
            label: c.display || c.code || '',
          })),
        );
      })
      .catch(() => {
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [binding.valueSet]);

  if (options.length === 0 && !loading) {
    return (
      <TextInput
        value={value}
        onChange={onChange}
        placeholder="Enter code..."
        disabled={disabled}
      />
    );
  }

  return (
    <Combobox
      options={options}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      loading={loading}
      disabled={disabled}
      creatable={binding.strength !== 'required'}
      clearable={binding.strength !== 'required'}
      placeholder="Select code..."
    />
  );
}
