/**
 * HumanNameInput — HumanName (family + given + prefix + suffix + use).
 */

import type { JSX } from 'react';
import { TextInput } from '../../ui/TextInput';

export interface HumanNameInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function HumanNameInput({ value, onChange, disabled }: HumanNameInputProps): JSX.Element {
  const v = value ?? {};

  const update = (field: string, val: unknown) => {
    onChange({ ...v, [field]: val || undefined });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <TextInput
          value={(v.family as string) ?? ''}
          onChange={(s) => update('family', s)}
          placeholder="family"
          disabled={disabled}
        />
        <TextInput
          value={((v.given as string[]) ?? []).join(', ')}
          onChange={(s) => update('given', s ? s.split(',').map((g) => g.trim()) : undefined)}
          placeholder="given (comma-separated)"
          disabled={disabled}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <TextInput
          value={((v.prefix as string[]) ?? []).join(', ')}
          onChange={(s) => update('prefix', s ? s.split(',').map((p) => p.trim()) : undefined)}
          placeholder="prefix"
          disabled={disabled}
        />
        <TextInput
          value={((v.suffix as string[]) ?? []).join(', ')}
          onChange={(s) => update('suffix', s ? s.split(',').map((p) => p.trim()) : undefined)}
          placeholder="suffix"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
