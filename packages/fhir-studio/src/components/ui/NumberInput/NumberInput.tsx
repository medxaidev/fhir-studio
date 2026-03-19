import type { InputHTMLAttributes } from 'react';
import styles from './NumberInput.module.css';

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  error?: string;
  onChange?: (value: number | undefined) => void;
}

export function NumberInput({
  className,
  error,
  onChange,
  disabled,
  required,
  step,
  ...rest
}: NumberInputProps) {
  const cls = [
    styles.input,
    error && styles.hasError,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.wrapper}>
      <input
        type="number"
        step={step ?? 'any'}
        className={cls}
        disabled={disabled}
        required={required}
        onChange={(e) => {
          if (!onChange) return;
          const num = e.currentTarget.valueAsNumber;
          onChange(Number.isNaN(num) ? undefined : num);
        }}
        {...rest}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
