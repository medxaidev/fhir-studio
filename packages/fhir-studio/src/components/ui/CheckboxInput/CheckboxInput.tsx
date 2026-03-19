import type { InputHTMLAttributes } from 'react';
import styles from './CheckboxInput.module.css';

export interface CheckboxInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  label?: string;
  error?: string;
  onChange?: (checked: boolean) => void;
}

export function CheckboxInput({
  className,
  label,
  error,
  onChange,
  disabled,
  defaultChecked,
  checked,
  ...rest
}: CheckboxInputProps) {
  const cls = [
    styles.wrapper,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <label className={styles.label}>
        <input
          type="checkbox"
          className={styles.checkbox}
          disabled={disabled}
          defaultChecked={defaultChecked}
          checked={checked}
          onChange={(e) => onChange?.(e.currentTarget.checked)}
          {...rest}
        />
        {label && <span className={styles.labelText}>{label}</span>}
      </label>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
