import { DatabaseIcon } from '../components/icons';
import { Button } from '../components/ui';
import styles from './Pages.module.css';

export function ResourcesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <DatabaseIcon width={48} height={48} />
        <h2 className={styles.title}>Resource Explorer</h2>
        <p className={styles.description}>
          Browse, search, and manage FHIR resources. View resource details,
          edit JSON, and perform CRUD operations.
        </p>
        <Button variant="secondary" disabled>
          Coming soon
        </Button>
      </div>
    </div>
  );
}
