// `@timotholt/solid-tree/headless` — build your own markup on the same behavior.
// The controller owns state; createTreeView supplies ARIA, focus and input handling as
// prop getters; the core algorithms are framework-free.
export { createTreeView } from "./view/headless/createTreeView.js";
export type { TreeViewApi, TreeViewOptions, ElementProps, ItemProps } from "./view/headless/createTreeView.js";
export { createTreeController } from "./controller/index.js";
export type { TreeController, TreeControllerOptions, CoreControllerOptions } from "./controller/index.js";
export {
  buildIndex,
  defaultAccessors,
  searchView,
  flatten,
  placeholderId,
  resolveKey,
  typeahead,
  isTypeaheadKey,
  reduceSelection,
  emptySelection,
  checkStateOf,
  toggleCheck,
  canMove,
  applyMove,
  DuplicateIdError,
} from "./core/index.js";
export type {
  TreeIndex,
  TreeAccessors,
  SearchView,
  Row,
  KeyAction,
  SelectionState,
  SelectionMode,
  CheckMode,
  CheckState,
  DropPosition,
} from "./core/index.js";
export type { FlatRow, TreeNodeData } from "./types.js";
