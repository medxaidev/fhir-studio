import type { InputHTMLAttributes } from 'react';
import styles from './TextInput.module.css';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  error?: string;
  onChange?: (value: string) => void;
}

export function TextInput({
  className,
  error,
  onChange,
  disabled,
  required,
  ...rest
}: TextInputProps) {
  const cls = [
    styles.input,
    error && styles.hasError,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.wrapper}>
      <input
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
