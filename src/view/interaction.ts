import { createMemo, createSignal, type Accessor } from "solid-js";
import type { TreeCtx } from "./context.js";
import type { TreeController } from "../controller/index.js";
import { isTypeaheadKey, resolveKey, typeahead, type TypeaheadState } from "../core/index.js";
import { findVisibleRowIndex } from "./navigation.js";
import type { FlatRow, TreeNodeData } from "../types.js";

export interface TreeInteractionOptions {
  tree: TreeController;
  getContainer: () => HTMLElement | undefined;
  /** Rows currently mounted in the DOM. Defaults to every logically visible row. */
  renderedRows?: Accessor<FlatRow[]>;
  /** Bring a full visible-row index into the rendered window before DOM focus. */
  ensureRowVisible?: (index: number) => void;
  /** Right-to-left layout (swaps ArrowLeft/ArrowRight). */
  rtl?: () => boolean;
}

/** Shared roving-focus and keyboard behavior for recursive and virtualized views. */
export function createTreeInteraction(
  options: TreeInteractionOptions
): Pick<TreeCtx, "tabbableId" | "focusRow" | "onRowKeyDown"> {
  const [focusedId, setFocusedId] = createSignal<string>();
  let focusRequest = 0;
  let typed: TypeaheadState | null = null;
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
    const rows = options.tree.flatRows();
    if (isTypeaheadKey(event)) {
      const next = typeahead(typed, event.key, Date.now(), rows, node.id, (id) => options.tree.index().get(id)?.label ?? "");
      typed = next.state;
      if (next.focusId) {
        event.preventDefault();
        focusRow(next.focusId);
      }
      return;
    }
    const action = resolveKey(event.key, node.id, rows, {
      rtl: options.rtl?.(),
      isDisabled: (id) => !!options.tree.index().get(id)?.disabled,
    });
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.toggleId) options.tree.toggle(action.toggleId);
    for (const id of action.expandIds ?? []) options.tree.expand(id);
    if (action.selectId) {
      options.tree.select(action.selectId);
      if (event.key === "Enter") options.tree.activate(action.selectId);
    }
    if (action.focusId) focusRow(action.focusId);
  };

  return { tabbableId, focusRow, onRowKeyDown };
}
