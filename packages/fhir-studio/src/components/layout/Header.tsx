import { usePage } from '@prismui/react';
import styles from './Header.module.css';

const PAGE_TITLES: Record<string, string> = {
  connections: 'Server Connections',
  ig: 'Implementation Guides',
  resources: 'Resource Explorer',
};

export function Header() {
  const { currentPage } = usePage();
  const title = PAGE_TITLES[currentPage ?? ''] ?? 'FHIR Studio';

  return (
    <header className={styles.header}>
      <span className={styles.title}>{title}</span>
      <div className={styles.spacer} />
      <span className={styles.badge}>Phase 001</span>
    </header>
  );
}
