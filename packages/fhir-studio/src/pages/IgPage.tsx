import { PackageIcon } from '../components/icons';
import { Button } from '../components/ui';
import styles from './Pages.module.css';

export function IgPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <PackageIcon width={48} height={48} />
        <h2 className={styles.title}>Implementation Guides</h2>
        <p className={styles.description}>
          Browse and explore FHIR Implementation Guides, StructureDefinitions,
          and Profile constraints.
        </p>
        <Button variant="secondary" disabled>
          Coming soon
        </Button>
      </div>
    </div>
  );
}
