import { create } from 'zustand';

export type TabId = 'setup' | 'repos' | 'history' | 'prompts' | 'usage';

interface UiState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  /** Bumping this signals data-changing actions so widgets (e.g. the usage
   * indicator) can refetch. */
  refreshNonce: number;
  triggerRefresh: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'setup',
  setActiveTab: (tab) => set({ activeTab: tab }),
  refreshNonce: 0,
  triggerRefresh: () => set((s) => ({ refreshNonce: s.refreshNonce + 1 })),
}));
