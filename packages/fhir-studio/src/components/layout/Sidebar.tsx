import { usePage } from '@prismui/react';
import { ServerIcon, PackageIcon, DatabaseIcon } from '../icons';
import styles from './Sidebar.module.css';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'connections', label: 'Connections', icon: ServerIcon },
  { id: 'ig',          label: 'IG Explorer', icon: PackageIcon },
  { id: 'resources',   label: 'Resources',   icon: DatabaseIcon },
];

export function Sidebar() {
  const { currentPage, mount, transition } = usePage();

  const handleNav = (pageId: string) => {
    mount(pageId);
    transition(pageId);
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>F</span>
        FHIR Studio
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              onClick={() => handleNav(item.id)}
            >
              <span className={styles.navIcon}>
                <Icon />
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className={styles.version}>v0.0.1</div>
    </aside>
  );
}
