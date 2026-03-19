import type { InputHTMLAttributes } from 'react';
import styles from './DateInput.module.css';

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  /** 'date' | 'datetime-local' | 'time' */
  inputType?: 'date' | 'datetime-local' | 'time';
  error?: string;
  onChange?: (value: string) => void;
}

export function DateInput({
  className,
  inputType = 'date',
  error,
  onChange,
  disabled,
  required,
  ...rest
}: DateInputProps) {
  const cls = [
    styles.input,
    error && styles.hasError,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.wrapper}>
      <input
        type={inputType}
        className={cls}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        {...rest}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
