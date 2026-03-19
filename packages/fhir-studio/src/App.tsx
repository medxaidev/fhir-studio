import { useEffect } from 'react';
import { PrismUIProvider, useRouter } from '@prismui/react';
import { runtime } from './runtime/setup';
import { AppLayout } from './components/layout';
import { ConnectionsPage, IgPage, ResourcesPage } from './pages';
import { loadConfig } from './lib/config-loader';
import { serverStore } from './stores/server-store';
import './styles/globals.css';

const ROUTE_MAP: Record<string, React.ComponentType> = {
  '/': ConnectionsPage,
  '/connections': ConnectionsPage,
  '/ig': IgPage,
  '/resources': ResourcesPage,
};

function ContentRouter() {
  const { path } = useRouter();
  const Component = ROUTE_MAP[path] ?? ConnectionsPage;
  return <Component />;
}

function InitApp() {
  useEffect(() => {
    const config = loadConfig();
    serverStore.loadServers(config.servers);
    // Auto-connect to the default server on startup
    serverStore.testConnection();
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
