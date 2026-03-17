import { ServerIcon } from '../components/icons';
import { Button } from '../components/ui';
import styles from './Pages.module.css';

export function ConnectionsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <ServerIcon width={48} height={48} />
        <h2 className={styles.title}>Server Connections</h2>
        <p className={styles.description}>
          Manage FHIR server connections. Connect, disconnect, and switch between
          multiple server environments.
        </p>
        <Button variant="secondary" disabled>
          Coming soon
        </Button>
      </div>
    </div>
  );
}
