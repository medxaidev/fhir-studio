import { useSyncExternalStore } from 'react';
import { ServerIcon, CheckCircleIcon, XCircleIcon, LoaderIcon } from '../../components/icons';
import { Button, StatusDot } from '../../components/ui';
import { serverStore } from '../../stores/server-store';
import type { ConnectionStatus } from '../../stores/server-store';
import styles from './ConnectionsPage.module.css';

function StatusLabel({ status, error }: { status: ConnectionStatus; error: string | null }) {
  switch (status) {
    case 'connected':
      return <span className={styles.statusOk}><CheckCircleIcon width={14} height={14} /> Connected</span>;
    case 'error':
      return <span className={styles.statusErr}><XCircleIcon width={14} height={14} /> {error ?? 'Failed'}</span>;
    case 'testing':
      return <span className={styles.statusTest}><LoaderIcon width={14} height={14} className={styles.spin} /> Testing…</span>;
    default:
      return <span className={styles.statusIdle}>Not tested</span>;
  }
}

export function ConnectionsPage() {
  const state = useSyncExternalStore(serverStore.subscribe, serverStore.getState);
  const { servers, currentServerId, connectionStatus, connectionError, serverVersion } = state;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <ServerIcon width={22} height={22} />
        <h2 className={styles.title}>Server Connections</h2>
      </div>

      {servers.length === 0 ? (
        <p className={styles.empty}>
          No servers configured. Add servers to <code>fhir.config.json</code>.
        </p>
      ) : (
        <div className={styles.list}>
          {servers.map((server) => {
            const isCurrent = server.id === currentServerId;
            return (
              <div
                key={server.id}
                className={`${styles.card} ${isCurrent ? styles.cardActive : ''}`}
              >
                <div className={styles.cardHeader}>
                  <StatusDot status={isCurrent ? connectionStatus : 'idle'} size="sm" />
                  <span className={styles.serverName}>{server.name}</span>
                  {isCurrent && <span className={styles.currentBadge}>Current</span>}
                </div>

                <div className={styles.serverUrl}>{server.baseUrl}</div>

                {isCurrent && connectionStatus === 'connected' && serverVersion && (
                  <div className={styles.serverMeta}>FHIR {serverVersion}</div>
                )}

                {isCurrent && (
                  <StatusLabel status={connectionStatus} error={connectionError} />
                )}

                <div className={styles.cardActions}>
                  {!isCurrent && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => serverStore.switchServer(server.id)}
                    >
                      Switch
                    </Button>
                  )}
                  {isCurrent && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={connectionStatus === 'testing'}
                      onClick={() => serverStore.testConnection()}
                    >
                      {connectionStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
