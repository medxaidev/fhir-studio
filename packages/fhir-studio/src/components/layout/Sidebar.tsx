import { useRouter } from '@prismui/react';
import { ServerIcon, PackageIcon, DatabaseIcon } from '../icons';
import styles from './Sidebar.module.css';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/connections', label: 'Connections', icon: ServerIcon },
  { path: '/ig', label: 'IG Explorer', icon: PackageIcon },
  { path: '/resources', label: 'Resources', icon: DatabaseIcon },
];

export function Sidebar() {
  const { path, push } = useRouter();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>F</span>
        FHIR Studio
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = path === item.path || (path === '/' && item.path === '/connections');
          return (
            <button
              key={item.path}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              onClick={() => push(item.path)}
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
