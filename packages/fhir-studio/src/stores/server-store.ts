import type { MedXAIClient } from 'fhir-rest-client';
import type { ServerConfig } from '../lib/config-loader';
import { createFhirClient } from '../lib/fhir-client-factory';

export type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

export interface ServerState {
  servers: ServerConfig[];
  currentServerId: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  serverVersion: string | null;
}

const initialState: ServerState = {
  servers: [],
  currentServerId: null,
  connectionStatus: 'idle',
  connectionError: null,
  serverVersion: null,
};

let _state: ServerState = { ...initialState };
let _client: MedXAIClient | null = null;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export const serverStore = {
  getState(): ServerState {
    return _state;
  },

  subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  getClient(): MedXAIClient | null {
    return _client;
  },

  loadServers(servers: ServerConfig[]) {
    _state = {
      ..._state,
      servers,
      currentServerId: servers.length > 0 ? servers[0].id : null,
      connectionStatus: 'idle',
      connectionError: null,
      serverVersion: null,
    };
    if (servers.length > 0) {
      _client = createFhirClient(servers[0].baseUrl);
    }
    notify();
  },

  switchServer(serverId: string) {
    const server = _state.servers.find((s) => s.id === serverId);
    if (!server) return;
    _state = {
      ..._state,
      currentServerId: serverId,
      connectionStatus: 'idle',
      connectionError: null,
      serverVersion: null,
    };
    _client = createFhirClient(server.baseUrl);
    notify();
  },

  async testConnection(): Promise<boolean> {
    if (!_client) return false;

    _state = { ..._state, connectionStatus: 'testing', connectionError: null };
    notify();

    try {
      const metadata = await _client.readMetadata();
      const fhirVersion = (metadata as Record<string, unknown>).fhirVersion as string | undefined;
      _state = {
        ..._state,
        connectionStatus: 'connected',
        connectionError: null,
        serverVersion: fhirVersion ?? 'unknown',
      };
      notify();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      _state = {
        ..._state,
        connectionStatus: 'error',
        connectionError: message,
        serverVersion: null,
      };
      notify();
      return false;
    }
  },

  getCurrentServer(): ServerConfig | null {
    return _state.servers.find((s) => s.id === _state.currentServerId) ?? null;
  },
};
