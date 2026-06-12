import { StateCreator } from "zustand";
import type { AppState } from "../index";

export interface UiSlice {
  settingsOpen: boolean;
  quickCaptureOpen: boolean;
  editingNodeId: string | null;
  createProjectPrompt: boolean;
  sidebarOpen: boolean;
  searchOpen: boolean;
  pendingFocusNodeId: string | null;
  todayOpen: boolean;
  graphOpen: boolean;

  setTodayOpen: (v: boolean) => void;
  setGraphOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setQuickCaptureOpen: (v: boolean) => void;
  setEditingNodeId: (id: string | null) => void;
  setCreateProjectPrompt: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setPendingFocusNodeId: (id: string | null) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  settingsOpen: false,
  quickCaptureOpen: false,
  editingNodeId: null,
  createProjectPrompt: false,
  sidebarOpen: true,
  searchOpen: false,
  pendingFocusNodeId: null,
  todayOpen: false,
  graphOpen: false,

  setTodayOpen: (v) => set({ todayOpen: v }),
  setGraphOpen: (v) => set({ graphOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setQuickCaptureOpen: (v) => set({ quickCaptureOpen: v }),
  setEditingNodeId: (id) => set({ editingNodeId: id }),
  setCreateProjectPrompt: (v) => set({ createProjectPrompt: v }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setPendingFocusNodeId: (id) => set({ pendingFocusNodeId: id }),
});
