import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <div className={styles.container}>
      <div className={[styles.spinner, styles[size]].join(' ')} role="status">
        <span className={styles.srOnly}>{label ?? 'Loading...'}</span>
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
