import type { ReactNode } from 'react';
import styles from './FormSection.module.css';

export interface FormSectionProps {
  title: string;
  description?: string;
  htmlFor?: string;
  required?: boolean;
  readonly?: boolean;
  error?: string;
  children: ReactNode;
}

export function FormSection({
  title,
  description,
  htmlFor,
  required,
  readonly,
  error,
  children,
}: FormSectionProps) {
  return (
    <div className={styles.section}>
      <label className={styles.label} htmlFor={htmlFor}>
        <span className={styles.title}>
          {title}
          {required && <span className={styles.asterisk}>*</span>}
        </span>
        {readonly && <span className={styles.readonlyBadge}>read-only</span>}
      </label>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.control}>{children}</div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
