import { useEffect } from 'react';
import { PrismUIProvider, usePage } from '@prismui/react';
import { runtime } from './runtime/setup';
import { AppLayout } from './components/layout';
import { ConnectionsPage, IgPage, ResourcesPage } from './pages';
import { loadConfig } from './lib/config-loader';
import { serverStore } from './stores/server-store';
import './styles/globals.css';

const PAGE_MAP: Record<string, React.ComponentType> = {
  connections: ConnectionsPage,
  ig: IgPage,
  resources: ResourcesPage,
};

const DEFAULT_PAGE = 'connections';

function ContentRouter() {
  const { currentPage } = usePage();
  const Component = PAGE_MAP[currentPage ?? DEFAULT_PAGE] ?? ConnectionsPage;
  return <Component />;
}

function InitApp() {
  const { mount, transition, currentPage } = usePage();

  useEffect(() => {
    if (!currentPage) {
      mount(DEFAULT_PAGE);
      transition(DEFAULT_PAGE);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const config = loadConfig();
    serverStore.loadServers(config.servers);
  }, []);

  return null;
}

export function App() {
  return (
    <PrismUIProvider runtime={runtime}>
      <InitApp />
      <AppLayout>
        <ContentRouter />
      </AppLayout>
    </PrismUIProvider>
  );
}
