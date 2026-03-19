/**
 * IdentifierInput — Identifier (system + value + use).
 */

import type { JSX } from 'react';
import { TextInput } from '../../ui/TextInput';
import { SelectInput } from '../../ui/SelectInput';

export interface IdentifierInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

const USE_OPTIONS = [
  { value: 'usual', label: 'Usual' },
  { value: 'official', label: 'Official' },
  { value: 'temp', label: 'Temp' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'old', label: 'Old' },
];

export function IdentifierInput({ value, onChange, disabled }: IdentifierInputProps): JSX.Element {
  const v = value ?? {};

  const update = (field: string, val: unknown) => {
    onChange({ ...v, [field]: val || undefined });
  };

  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <SelectInput
        value={(v.use as string) ?? ''}
        onChange={(s) => update('use', s)}
        options={USE_OPTIONS}
        placeholder="use"
        disabled={disabled}
      />
      <TextInput
        value={(v.system as string) ?? ''}
        onChange={(s) => update('system', s)}
        placeholder="system"
        disabled={disabled}
      />
      <TextInput
        value={(v.value as string) ?? ''}
        onChange={(s) => update('value', s)}
        placeholder="value"
        disabled={disabled}
      />
    </div>
  );
}
