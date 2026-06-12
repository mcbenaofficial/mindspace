import { create } from "zustand";
import { createDataSlice, DataSlice } from "./slices/dataSlice";
import { createUiSlice, UiSlice } from "./slices/uiSlice";
import { createSettingsSlice, SettingsSlice } from "./slices/settingsSlice";
import { createHistorySlice, HistorySlice } from "./slices/historySlice";
import { createBrainSlice, BrainSlice } from "./slices/brainSlice";

export type AppState = DataSlice & UiSlice & SettingsSlice & HistorySlice & BrainSlice;

export const useStore = create<AppState>()((...a) => ({
  ...createDataSlice(...a),
  ...createUiSlice(...a),
  ...createSettingsSlice(...a),
  ...createHistorySlice(...a),
  ...createBrainSlice(...a),
}));
