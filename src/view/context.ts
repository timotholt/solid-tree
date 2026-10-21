import { createContext, useContext, type JSX } from "solid-js";
import type { TreeController } from "../controller/index.js";
import type { FlatRow, TreeNodeData } from "../types.js";
import type { TreeViewApi } from "./headless/createTreeView.js";

/** What every row needs: the controller, the headless view, and the render slots. */
export interface TreeCtx {
  tree: TreeController;
  view: TreeViewApi;
  renderLabel?: (node: TreeNodeData) => JSX.Element;
  renderActionNode?: (node: TreeNodeData) => JSX.Element;
  /** Before the icon: checkboxes, drag handles, status dots. */
  renderLeading?: (row: FlatRow) => JSX.Element;
}

export const TreeContext = createContext<TreeCtx>();
export const useTree = (): TreeCtx => useContext(TreeContext)!;
