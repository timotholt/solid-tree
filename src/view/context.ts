import { createContext, useContext, JSX } from "solid-js";
import { TreeNodeData, type TreeRowClickPolicy } from "../types.js";

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
  rowClickPolicy: TreeRowClickPolicy;
  accessibleTree: boolean;
  tabbableId: () => string | undefined;
  focusRow: (id: string) => void;
  onRowKeyDown: (event: KeyboardEvent, node: TreeNodeData) => void;
  renderActionNode?: (node: TreeNodeData) => JSX.Element;
  renderLabel?: (node: TreeNodeData) => JSX.Element;
}

export const TreeContext = createContext<TreeCtx>();
export const useTree = (): TreeCtx => useContext(TreeContext)!;
