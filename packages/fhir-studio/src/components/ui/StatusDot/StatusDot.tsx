import styles from './StatusDot.module.css';

export interface StatusDotProps {
  status: 'idle' | 'testing' | 'connected' | 'error';
  size?: 'sm' | 'md';
}

export function StatusDot({ status, size = 'md' }: StatusDotProps) {
  const cls = [styles.dot, styles[status], styles[size]].join(' ');
  return <span className={cls} />;
}
