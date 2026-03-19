/**
 * AddressInput — Address (line + city + state + postalCode + country).
 */

import type { JSX } from 'react';
import { TextInput } from '../../ui/TextInput';

export interface AddressInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function AddressInput({ value, onChange, disabled }: AddressInputProps): JSX.Element {
  const v = value ?? {};

  const update = (field: string, val: unknown) => {
    onChange({ ...v, [field]: val || undefined });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <TextInput
        value={((v.line as string[]) ?? []).join('\n')}
        onChange={(s) => update('line', s ? s.split('\n') : undefined)}
        placeholder="line"
        disabled={disabled}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <TextInput
          value={(v.city as string) ?? ''}
          onChange={(s) => update('city', s)}
          placeholder="city"
          disabled={disabled}
        />
        <TextInput
          value={(v.state as string) ?? ''}
          onChange={(s) => update('state', s)}
          placeholder="state"
          disabled={disabled}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <TextInput
          value={(v.postalCode as string) ?? ''}
          onChange={(s) => update('postalCode', s)}
          placeholder="postalCode"
          disabled={disabled}
        />
        <TextInput
          value={(v.country as string) ?? ''}
          onChange={(s) => update('country', s)}
          placeholder="country"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
