/**
 * QuantityInput — Quantity (value + unit + system + code).
 */

import type { JSX } from 'react';
import { TextInput } from '../../ui/TextInput';
import { NumberInput } from '../../ui/NumberInput';

export interface QuantityInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function QuantityInput({ value, onChange, disabled }: QuantityInputProps): JSX.Element {
  const v = value ?? {};

  const update = (field: string, val: unknown) => {
    onChange({ ...v, [field]: val ?? undefined });
  };

  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <NumberInput
        value={v.value != null ? Number(v.value) : undefined}
        step="any"
        onChange={(n) => update('value', n)}
        placeholder="value"
        disabled={disabled}
      />
      <TextInput
        value={(v.unit as string) ?? ''}
        onChange={(s) => update('unit', s)}
        placeholder="unit"
        disabled={disabled}
      />
      <TextInput
        value={(v.system as string) ?? ''}
        onChange={(s) => update('system', s)}
        placeholder="system"
        disabled={disabled}
      />
      <TextInput
        value={(v.code as string) ?? ''}
        onChange={(s) => update('code', s)}
        placeholder="code"
        disabled={disabled}
      />
    </div>
  );
}
