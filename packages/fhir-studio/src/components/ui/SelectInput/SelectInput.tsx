import type { SelectHTMLAttributes } from 'react';
import styles from './SelectInput.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectInputProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  error?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function SelectInput({
  className,
  options,
  error,
  onChange,
  disabled,
  required,
  placeholder,
  value,
  defaultValue,
  ...rest
}: SelectInputProps) {
  const cls = [
    styles.select,
    error && styles.hasError,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.wrapper}>
      <select
        className={cls}
        disabled={disabled}
        required={required}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
