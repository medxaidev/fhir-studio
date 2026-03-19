import type { ReactNode } from 'react';
import styles from './Fieldset.module.css';

export interface FieldsetProps {
  legend?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function Fieldset({
  legend,
  children,
  className,
}: FieldsetProps) {
  const cls = [styles.fieldset, className].filter(Boolean).join(' ');

  return (
    <fieldset className={cls}>
      {legend && <legend className={styles.legend}>{legend}</legend>}
      <div className={styles.content}>{children}</div>
    </fieldset>
  );
}
