import { StateCreator } from "zustand";
import { MindEdge, MindNode } from "../../types";
import type { AppState } from "../index";

export type HistEntry =
  | { t: "add"; node: MindNode }
  | { t: "del"; node: MindNode; edges: MindEdge[] }
  | { t: "upd"; id: string; prev: Partial<MindNode>; next: Partial<MindNode>; at: number }
  | { t: "addEdge"; edge: MindEdge }
  | { t: "delEdge"; edge: MindEdge }
  | { t: "batch"; entries: HistEntry[] };

const HISTORY_CAP = 100;
// Rapid updates to the same node (typing, slider drags) merge into one entry.
const COALESCE_MS = 1500;

// Collects entries while a runBatch() is active so a multi-node operation
// (align, group) undoes as a single step.
let batchBuf: HistEntry[] | null = null;

export interface HistorySlice {
  _hist: HistEntry[];
  _histIdx: number;
  _restoring: boolean;
  recordHistory: (entry: HistEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  runBatch: (fn: () => Promise<void>) => Promise<void>;
}

async function applyEntry(
  get: () => AppState,
  entry: HistEntry,
  dir: "undo" | "redo"
): Promise<void> {
  switch (entry.t) {
    case "batch": {
      const list = dir === "undo" ? [...entry.entries].reverse() : entry.entries;
      for (const e of list) await applyEntry(get, e, dir);
      break;
    }
    case "add":
      if (dir === "undo") await get().deleteNode(entry.node.id);
      else await get().restoreNode(entry.node);
      break;
    case "del":
      if (dir === "undo") {
        await get().restoreNode(entry.node);
        for (const e of entry.edges) await get().restoreEdge(e);
      } else {
        await get().deleteNode(entry.node.id);
      }
      break;
    case "upd":
      await get().updateNode(entry.id, dir === "undo" ? entry.prev : entry.next);
      break;
    case "addEdge":
      if (dir === "undo") await get().deleteEdge(entry.edge.id);
      else await get().restoreEdge(entry.edge);
      break;
    case "delEdge":
      if (dir === "undo") await get().restoreEdge(entry.edge);
      else await get().deleteEdge(entry.edge.id);
      break;
  }
}

export const createHistorySlice: StateCreator<AppState, [], [], HistorySlice> = (set, get) => ({
  _hist: [],
  _histIdx: 0,
  _restoring: false,

  recordHistory: (entry) => {
    if (get()._restoring) return;
    if (batchBuf) {
      batchBuf.push(entry);
      return;
    }
    set((s) => {
      const hist = s._hist.slice(0, s._histIdx);
      const last = hist[hist.length - 1];
      if (
        entry.t === "upd" &&
        last?.t === "upd" &&
        last.id === entry.id &&
        entry.at - last.at < COALESCE_MS
      ) {
        hist[hist.length - 1] = {
          ...last,
          next: { ...last.next, ...entry.next },
          prev: { ...entry.prev, ...last.prev },
          at: entry.at,
        };
        return { _hist: hist, _histIdx: hist.length };
      }
      hist.push(entry);
      const overflow = Math.max(0, hist.length - HISTORY_CAP);
      return { _hist: hist.slice(overflow), _histIdx: hist.length - overflow };
    });
  },

  undo: async () => {
    const { _hist, _histIdx, _restoring } = get();
    if (_restoring || _histIdx <= 0) return;
    const entry = _hist[_histIdx - 1];
    set({ _restoring: true });
    try {
      await applyEntry(get, entry, "undo");
      set({ _histIdx: _histIdx - 1 });
    } catch (err) {
      console.warn("Undo failed (entry may reference deleted data):", err);
      set({ _histIdx: _histIdx - 1 });
    } finally {
      set({ _restoring: false });
    }
  },

  redo: async () => {
    const { _hist, _histIdx, _restoring } = get();
    if (_restoring || _histIdx >= _hist.length) return;
    const entry = _hist[_histIdx];
    set({ _restoring: true });
    try {
      await applyEntry(get, entry, "redo");
      set({ _histIdx: _histIdx + 1 });
    } catch (err) {
      console.warn("Redo failed (entry may reference deleted data):", err);
      set({ _histIdx: _histIdx + 1 });
    } finally {
      set({ _restoring: false });
    }
  },

  runBatch: async (fn) => {
    if (batchBuf) {
      await fn();
      return;
    }
    batchBuf = [];
    try {
      await fn();
    } finally {
      const entries = batchBuf;
      batchBuf = null;
      if (entries && entries.length > 0) {
        get().recordHistory(
          entries.length === 1 ? entries[0] : { t: "batch", entries }
        );
      }
    }
  },
});
