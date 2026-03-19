import type { TextareaHTMLAttributes } from 'react';
import styles from './TextareaInput.module.css';

export interface TextareaInputProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  error?: string;
  onChange?: (value: string) => void;
}

export function TextareaInput({
  className,
  error,
  onChange,
  disabled,
  required,
  rows = 3,
  ...rest
}: TextareaInputProps) {
  const cls = [
    styles.textarea,
    error && styles.hasError,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.wrapper}>
      <textarea
        className={cls}
        disabled={disabled}
        required={required}
        rows={rows}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        {...rest}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
