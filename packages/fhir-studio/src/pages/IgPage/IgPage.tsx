import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { igStore } from '../../stores/ig-store';
import { serverStore } from '../../stores/server-store';
import { IgListView, IgDetailView } from '../../components/ig-explorer';
import styles from './IgPage.module.css';

export function IgPage() {
  const serverState = useSyncExternalStore(serverStore.subscribe, serverStore.getState);
  const igState = useSyncExternalStore(igStore.subscribe, igStore.getState);
  const prevServerIdRef = useRef<string | null>(serverState.currentServerId);

  // Reset ig-store only when server actually changes (not on initial mount)
  useEffect(() => {
    if (prevServerIdRef.current !== serverState.currentServerId) {
      prevServerIdRef.current = serverState.currentServerId;
      igStore.resetService();
    }
  }, [serverState.currentServerId]);

  // Load IGs when connected and idle
  useEffect(() => {
    if (serverState.connectionStatus === 'connected' && igState.igListStatus === 'idle') {
      igStore.loadIGs();
    }
  }, [serverState.connectionStatus, igState.igListStatus]);

  // Not connected — show prompt
  if (serverState.connectionStatus !== 'connected') {
    return (
      <div className={styles.page}>
        <div className={styles.notConnected}>
          Connect to a FHIR server to explore Implementation Guides.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {igState.viewMode === 'list' && <IgListView />}
      {igState.viewMode === 'detail' && <IgDetailView />}
    </div>
  );
}
