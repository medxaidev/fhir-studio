import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'default' | 'required' | 'optional' | 'mustSupport' | 'fixed' | 'binding-required' | 'binding-extensible' | 'binding-preferred' | 'binding-example';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  const cls = [styles.badge, styles[variant], className].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}
