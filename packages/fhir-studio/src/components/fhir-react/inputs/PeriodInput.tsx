/**
 * PeriodInput — Period (start + end).
 */

import type { JSX } from 'react';
import { DateInput } from '../../ui/DateInput';

export interface PeriodInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function PeriodInput({ value, onChange, disabled }: PeriodInputProps): JSX.Element {
  const v = value ?? {};

  const update = (field: string, val: string) => {
    onChange({ ...v, [field]: val || undefined });
  };

  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <DateInput
        inputType="datetime-local"
        value={(v.start as string) ?? ''}
        onChange={(s) => update('start', s)}
        placeholder="start"
        disabled={disabled}
      />
      <DateInput
        inputType="datetime-local"
        value={(v.end as string) ?? ''}
        onChange={(s) => update('end', s)}
        placeholder="end"
        disabled={disabled}
      />
    </div>
  );
}
