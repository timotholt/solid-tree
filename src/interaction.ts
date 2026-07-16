import { createMemo, createSignal, type Accessor } from "solid-js";
import type { TreeCtx } from "./context.js";
import type { TreeController } from "./controller.js";
import { findVisibleRowIndex, resolveTreeKeyboardAction } from "./navigation.js";
import type { FlatRow, TreeNodeData } from "./types.js";

export interface TreeInteractionOptions {
  tree: TreeController;
  getContainer: () => HTMLElement | undefined;
  /** Rows currently mounted in the DOM. Defaults to every logically visible row. */
  renderedRows?: Accessor<FlatRow[]>;
  /** Bring a full visible-row index into the rendered window before DOM focus. */
  ensureRowVisible?: (index: number) => void;
}

/** Shared roving-focus and keyboard behavior for recursive and virtualized views. */
export function createTreeInteraction(
  options: TreeInteractionOptions
): Pick<TreeCtx, "tabbableId" | "focusRow" | "onRowKeyDown"> {
  const [focusedId, setFocusedId] = createSignal<string>();
  let focusRequest = 0;
  const mountedNavigableRows = createMemo(() =>
    (options.renderedRows?.() ?? options.tree.flatRows()).filter((row) => row.navigable)
  );

  const tabbableId = () => {
    const rows = mountedNavigableRows();
    const focused = focusedId();
    if (focused && rows.some((row) => row.node.id === focused)) return focused;
    const selected = options.tree.selectedId();
    if (selected && rows.some((row) => row.node.id === selected)) return selected;
    return rows[0]?.node.id;
  };

  const findRenderedRow = (id: string) =>
    Array.from(options.getContainer()?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? []).find(
      (element) => element.dataset.treeId === id
    );

  const focusWhenRendered = (id: string, request: number, remainingFrames = 4) => {
    queueMicrotask(() => {
      if (request !== focusRequest) return;
      const row = findRenderedRow(id);
      if (row) {
        row.focus();
        return;
      }
      if (remainingFrames <= 0) return;
      const view = options.getContainer()?.ownerDocument.defaultView;
      if (view?.requestAnimationFrame) {
        view.requestAnimationFrame(() => focusWhenRendered(id, request, remainingFrames - 1));
      } else {
        setTimeout(() => focusWhenRendered(id, request, remainingFrames - 1), 0);
      }
    });
  };

  const focusRow = (id: string) => {
    const index = findVisibleRowIndex(options.tree.flatRows(), id);
    if (index < 0) return;
    setFocusedId(id);
    focusRequest += 1;
    options.ensureRowVisible?.(index);
    focusWhenRendered(id, focusRequest);
  };

  const onRowKeyDown = (event: KeyboardEvent, node: TreeNodeData) => {
    // An action-slot control owns its own keyboard events.
    if (event.target !== event.currentTarget) return;
    const action = resolveTreeKeyboardAction(
      event.key,
      node.id,
      options.tree.flatRows(),
      options.tree.expandedIds()
    );
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.toggleId) options.tree.toggle(action.toggleId);
    if (action.selectId) options.tree.select(action.selectId);
    if (action.focusId) focusRow(action.focusId);
  };

  return { tabbableId, focusRow, onRowKeyDown };
}
