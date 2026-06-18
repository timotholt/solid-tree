import { createContext, useContext, JSX } from "solid-js";
import { TreeNodeData } from "./types.js";

// Shared per-render state for the rows — carried via context so the recursion
// only passes what actually varies per node (node + depth). Reactive bits
// (expanded/selectedId/highlightQuery) are accessors so tracking flows.
export interface TreeCtx {
  expanded: () => Record<string, boolean>;
  selectedId: () => string | null | undefined;
  highlightQuery: () => string | null;
  isDimmed: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNodeData) => void;
  renderActionNode?: (node: TreeNodeData) => JSX.Element;
  renderLabel?: (node: TreeNodeData) => JSX.Element;
}

export const TreeContext = createContext<TreeCtx>();
export const useTree = (): TreeCtx => useContext(TreeContext)!;
