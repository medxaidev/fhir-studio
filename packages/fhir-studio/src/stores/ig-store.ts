/**
 * ig-store.ts
 *
 * State management for the IG Explorer page.
 * Uses the same useSyncExternalStore pattern as server-store.ts.
 *
 * @module fhir-studio/stores/ig-store
 */

import type { IGSummary, IGIndex } from 'fhir-rest-client';
import { IgService } from '../services/ig-service';
import type { TreeNode } from '../lib/ig-tree-types';
import { serverStore } from './server-store';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type AsyncStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type IgViewMode = 'list' | 'detail';
export type IgTab = 'profiles' | 'extensions' | 'valueSets' | 'codeSystems' | 'searchParameters';

export interface NavigationEntry {
  igId: string;
  profileId: string;
  nodeId?: string;
  label: string;
}

export interface IGStoreState {
  // View mode
  viewMode: IgViewMode;
  activeTab: IgTab;

  // IG directory
  igList: IGSummary[];
  igListStatus: AsyncStatus;

  // Selected IG
  selectedIgId: string | null;
  igIndex: IGIndex | null;
  igIndexStatus: AsyncStatus;

  // Selected resource in current tab
  selectedResourceId: string | null;

  // Selected Profile tree
  selectedProfileId: string | null;
  treeNodes: TreeNode[];
  treeStatus: AsyncStatus;

  // Selected Element
  selectedNodeId: string | null;

  // Navigation history (cross-profile jumps)
  navigationStack: NavigationEntry[];

  // Error
  error: string | null;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: IGStoreState = {
  viewMode: 'list',
  activeTab: 'profiles',
  igList: [],
  igListStatus: 'idle',
  selectedIgId: null,
  igIndex: null,
  igIndexStatus: 'idle',
  selectedResourceId: null,
  selectedProfileId: null,
  treeNodes: [],
  treeStatus: 'idle',
  selectedNodeId: null,
  navigationStack: [],
  error: null,
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _state: IGStoreState = { ...initialState };
let _service: IgService | null = null;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

function setState(partial: Partial<IGStoreState>) {
  _state = { ..._state, ...partial };
  notify();
}

function getService(): IgService {
  if (!_service) {
    const client = serverStore.getClient();
    if (!client) {
      throw new Error('No FHIR client available — connect to a server first.');
    }
    _service = new IgService(client);
  }
  return _service;
}

// ---------------------------------------------------------------------------
// Helper: find TreeNode by id (recursive)
// ---------------------------------------------------------------------------

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public store
// ---------------------------------------------------------------------------

export const igStore = {
  getState(): IGStoreState {
    return _state;
  },

  subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  /**
   * Reset the service instance (e.g. after server switch).
   */
  resetService() {
    _service = null;
    _state = { ...initialState };
    notify();
  },

  /**
   * Load the list of available IGs.
   */
  async loadIGs(): Promise<void> {
    setState({ igListStatus: 'loading', error: null });
    try {
      const service = getService();
      const igList = await service.loadIGList();
      setState({ igList, igListStatus: 'loaded' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load IGs';
      setState({ igListStatus: 'error', error: message });
    }
  },

  /**
   * Enter an IG detail view — select IG and switch to detail mode.
   */
  async enterIG(igId: string): Promise<void> {
    await igStore.selectIG(igId);
    setState({ viewMode: 'detail' });
  },

  /**
   * Go back to the IG list view.
   */
  goBackToList() {
    setState({
      viewMode: 'list',
      selectedIgId: null,
      igIndex: null,
      igIndexStatus: 'idle',
      activeTab: 'profiles',
      selectedResourceId: null,
      selectedProfileId: null,
      treeNodes: [],
      treeStatus: 'idle',
      selectedNodeId: null,
    });
  },

  /**
   * Switch active tab within the IG detail view.
   */
  setActiveTab(tab: IgTab) {
    setState({
      activeTab: tab,
      selectedResourceId: null,
      selectedProfileId: null,
      treeNodes: [],
      treeStatus: 'idle',
      selectedNodeId: null,
    });
  },

  /**
   * Select a resource in the current tab's list.
   */
  selectResource(resourceId: string | null) {
    const id = resourceId || null;
    setState({
      selectedResourceId: id,
      // Clear tree when deselecting
      ...(id ? {} : { selectedProfileId: null, treeNodes: [], treeStatus: 'idle' as AsyncStatus, selectedNodeId: null }),
    });
    // If on profiles or extensions tab, also load the profile tree
    if (id) {
      const tab = _state.activeTab;
      if (tab === 'profiles' || tab === 'extensions') {
        igStore.selectProfile(id);
      }
    }
  },

  /**
   * Select an IG and load its index.
   */
  async selectIG(igId: string): Promise<void> {
    setState({
      selectedIgId: igId,
      igIndex: null,
      igIndexStatus: 'loading',
      // Reset profile state when switching IG
      selectedProfileId: null,
      treeNodes: [],
      treeStatus: 'idle',
      selectedNodeId: null,
      error: null,
    });
    try {
      const service = getService();
      const igIndex = await service.loadIGIndex(igId);
      setState({ igIndex, igIndexStatus: 'loaded' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load IG index';
      setState({ igIndexStatus: 'error', error: message });
    }
  },

  /**
   * Select a profile and build the element tree.
   */
  async selectProfile(sdId: string): Promise<void> {
    const igId = _state.selectedIgId;
    if (!igId) return;

    setState({
      selectedProfileId: sdId,
      treeNodes: [],
      treeStatus: 'loading',
      selectedNodeId: null,
      error: null,
    });
    try {
      const service = getService();
      const treeNodes = await service.loadProfile(igId, sdId);
      setState({ treeNodes, treeStatus: 'loaded' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      setState({ treeStatus: 'error', error: message });
    }
  },

  /**
   * Select a tree node for detail display.
   */
  selectNode(nodeId: string | null) {
    setState({ selectedNodeId: nodeId });
  },

  /**
   * Get the currently selected TreeNode object.
   */
  getSelectedNode(): TreeNode | null {
    if (!_state.selectedNodeId) return null;
    return findNodeById(_state.treeNodes, _state.selectedNodeId);
  },

  /**
   * Navigate to a different profile (cross-profile jump).
   * Pushes current location to navigation stack.
   */
  async navigateTo(igId: string, profileId: string, label: string, nodeId?: string): Promise<void> {
    // Push current location
    if (_state.selectedIgId && _state.selectedProfileId) {
      const entry: NavigationEntry = {
        igId: _state.selectedIgId,
        profileId: _state.selectedProfileId,
        nodeId: _state.selectedNodeId ?? undefined,
        label: label || _state.selectedProfileId,
      };
      setState({
        navigationStack: [..._state.navigationStack, entry],
      });
    }

    // Navigate
    if (igId !== _state.selectedIgId) {
      await igStore.selectIG(igId);
    }
    await igStore.selectProfile(profileId);
    if (nodeId) {
      igStore.selectNode(nodeId);
    }
  },

  /**
   * Go back in navigation history.
   */
  async navigateBack(): Promise<void> {
    const stack = [..._state.navigationStack];
    const entry = stack.pop();
    if (!entry) return;

    setState({ navigationStack: stack });

    if (entry.igId !== _state.selectedIgId) {
      await igStore.selectIG(entry.igId);
    }
    await igStore.selectProfile(entry.profileId);
    if (entry.nodeId) {
      igStore.selectNode(entry.nodeId);
    }
  },

  /**
   * Toggle expand/collapse of a tree node.
   */
  toggleNodeExpansion(nodeId: string) {
    const toggleInList = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        if (node.children) {
          return { ...node, children: toggleInList(node.children) };
        }
        return node;
      });

    setState({ treeNodes: toggleInList(_state.treeNodes) });
  },
};
