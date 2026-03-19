/**
 * ContactPointInput — ContactPoint (system + value + use + rank).
 */

import type { JSX } from 'react';
import { TextInput } from '../../ui/TextInput';
import { SelectInput } from '../../ui/SelectInput';

export interface ContactPointInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

const SYSTEM_OPTIONS = [
  { value: 'phone', label: 'Phone' },
  { value: 'fax', label: 'Fax' },
  { value: 'email', label: 'Email' },
  { value: 'pager', label: 'Pager' },
  { value: 'url', label: 'URL' },
  { value: 'sms', label: 'SMS' },
  { value: 'other', label: 'Other' },
];

const USE_OPTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'temp', label: 'Temp' },
  { value: 'old', label: 'Old' },
  { value: 'mobile', label: 'Mobile' },
];

export function ContactPointInput({ value, onChange, disabled }: ContactPointInputProps): JSX.Element {
  const v = value ?? {};

  const update = (field: string, val: unknown) => {
    onChange({ ...v, [field]: val || undefined });
  };

  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <SelectInput
        value={(v.system as string) ?? ''}
        onChange={(s) => update('system', s)}
        options={SYSTEM_OPTIONS}
        placeholder="system"
        disabled={disabled}
      />
      <TextInput
        value={(v.value as string) ?? ''}
        onChange={(s) => update('value', s)}
        placeholder="value"
        disabled={disabled}
      />
      <SelectInput
        value={(v.use as string) ?? ''}
        onChange={(s) => update('use', s)}
        options={USE_OPTIONS}
        placeholder="use"
        disabled={disabled}
      />
    </div>
  );
}
