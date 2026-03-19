import { useSyncExternalStore } from 'react';
import { useRouter } from '@prismui/react';
import { StatusDot } from '../ui';
import { serverStore } from '../../stores/server-store';
import styles from './Header.module.css';

const PATH_TITLES: Record<string, string> = {
  '/': 'Server Connections',
  '/connections': 'Server Connections',
  '/ig': 'IG Explorer',
  '/resources': 'Resource Explorer',
};

export function Header() {
  const { path } = useRouter();
  const title = PATH_TITLES[path] ?? 'FHIR Studio';
  const state = useSyncExternalStore(serverStore.subscribe, serverStore.getState);
  const currentServer = serverStore.getCurrentServer();

  return (
    <header className={styles.header}>
      <span className={styles.title}>{title}</span>
      <div className={styles.spacer} />
      {currentServer && (
        <div className={styles.serverInfo}>
          <StatusDot status={state.connectionStatus} size="sm" />
          <span className={styles.serverName}>{currentServer.name}</span>
        </div>
      )}
    </header>
  );
}
