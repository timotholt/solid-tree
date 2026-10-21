import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor, type JSX } from "solid-js";
import type { TreeController } from "../../controller/index.js";
import { isTypeaheadKey, resolveKey, typeahead, type DropPosition, type TypeaheadState } from "../../core/index.js";
import type { FlatRow, TreeRowClickPolicy } from "../../types.js";
import { shouldToggleFromRowClick } from "../navigation.js";
import type { DragAndDrop, Drop } from "./dnd.js";

/** What the database tier adds, detected structurally so the core view stays generic. */
interface MaybeLazy {
  loading?(id: string | null): boolean;
  error?(id: string | null): unknown;
  retry?(id: string | null): Promise<void>;
}

export interface TreeViewOptions {
  tree: TreeController;
  /** The element carrying getRootProps (for focusing rows). */
  getContainer: () => HTMLElement | undefined;
  /** Rows currently mounted (virtualized views). Defaults to every visible row. */
  renderedRows?: Accessor<FlatRow[]>;
  /** Bring a visible-row index into the rendered window before focusing it. */
  ensureRowVisible?: (index: number) => void;
  rowClickPolicy?: () => TreeRowClickPolicy | undefined;
  rtl?: () => boolean | undefined;
  ariaLabel?: () => string | undefined;
  ariaLabelledBy?: () => string | undefined;
}

/** Props for any element type (spread onto div, li, button…). */
export type ElementProps<E extends HTMLElement = HTMLElement> = Omit<JSX.HTMLAttributes<E>, "ref"> &
  Record<`data-${string}`, string | undefined> &
  Record<`aria-${string}`, unknown>;
export type ItemProps<E extends HTMLElement = HTMLElement> = ElementProps<E>;

/**
 * Headless tree view (PLAN P4): ARIA + focus + pointer/keyboard behavior as prop getters
 * over a controller. Spread them onto any markup:
 *
 * ```tsx
 * const view = createTreeView({ tree, getContainer: () => el });
 * <div ref={el} {...view.getRootProps()}>
 *   <For each={tree.flatRows()}>{(row) => <div {...view.getItemProps(() => row)}>{row.node.label}</div>}</For>
 * </div>
 * ```
 *
 * Returned objects use getters, so the attributes stay reactive inside JSX spreads.
 */
export function createTreeView(opts: TreeViewOptions) {
  const tree = opts.tree;
  const lazy = tree as TreeController & MaybeLazy;
  const [focusedId, setFocusedId] = createSignal<string>();
  let focusRequest = 0;
  let typed: TypeaheadState | null = null;
  const [announcement, setAnnouncement] = createSignal("");
  const labelOf = (id: string) => tree.pendingLabel(id) ?? tree.index().get(id)?.label ?? id;

  // ── moves: shared by keyboard and pointer (SPEC-features 7.4) ───────────────
  const movingSources = (id: string) => {
    if (tree.selectionMode() === "multiple" && tree.selectedIds().has(id)) {
      const order = tree.flatRows().map((r) => r.id);
      return [...tree.selectedIds()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    return [id];
  };
  const doMove = async (sources: string[], target: string, position: DropPosition) => {
    const ok = await tree.move(sources, target, position);
    if (!ok) return false;
    const what = sources.length === 1 ? labelOf(sources[0]) : `${sources.length} items`;
    const where = position === "inside" ? "into" : position;
    setAnnouncement(`Moved ${what} ${where} ${labelOf(target)}`);
    return true;
  };
  const keyboardMove = (key: string, id: string) => {
    const idx = tree.index();
    const sibs = idx.siblingsOf(id).filter((x) => idx.kindOf(x) === "node");
    const i = sibs.indexOf(id);
    const sources = movingSources(id);
    if (key === "ArrowUp" && i > 0) return doMove(sources, sibs[i - 1], "before");
    if (key === "ArrowDown" && i >= 0 && i < sibs.length - 1) return doMove(sources, sibs[i + 1], "after");
    if (key === "ArrowLeft") {
      const parent = idx.parentOf(id);
      if (parent) return doMove(sources, parent, "after");
    }
    if (key === "ArrowRight" && i > 0) return doMove(sources, sibs[i - 1], "inside");
    return Promise.resolve(false);
  };

  // ── pointer drag-and-drop ───────────────────────────────────────────────────
  // ── pointer drag-and-drop: loaded on demand (./dnd.ts) ──────────────────────
  const [drop, setDrop] = createSignal<Drop | null>(null);
  const [draggingIds, setDraggingIds] = createSignal<ReadonlySet<string>>(new Set());
  let dnd: DragAndDrop | undefined;
  let loadingDnd = false;
  let disposed = false;
  // A gesture that starts before ./dnd.ts has loaded is buffered (press, latest move,
  // release) and replayed when it arrives, so even an immediate drag is not lost.
  let pending: { down: [PointerEvent, FlatRow]; move?: PointerEvent; up?: PointerEvent } | undefined;
  const bufferMove = (e: PointerEvent) => {
    if (pending && e.pointerId === pending.down[0].pointerId) pending.move = e;
  };
  const bufferUp = (e: PointerEvent) => {
    if (pending && e.pointerId === pending.down[0].pointerId) pending.up = e;
  };
  const stopBuffering = () => {
    if (typeof window === "undefined") return; // cleanup also runs after a server render
    window.removeEventListener("pointermove", bufferMove, true);
    window.removeEventListener("pointerup", bufferUp, true);
  };
  const loadDnd = () => {
    if (dnd || loadingDnd) return;
    loadingDnd = true;
    void import("./dnd.js").then((m) => {
      if (disposed) return;
      dnd = m.createDragAndDrop({ tree, getContainer: opts.getContainer, movingSources, doMove, focusRow, drop, setDrop, setDraggingIds });
      const p = pending;
      pending = undefined;
      stopBuffering();
      if (!p) return;
      dnd.onPointerDown(...p.down); // installs dnd's own window listeners
      const replay = (type: string, src: PointerEvent) =>
        window.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: src.clientX, clientY: src.clientY, pointerId: src.pointerId, pointerType: src.pointerType, button: src.button, isPrimary: src.isPrimary }));
      if (p.move) replay("pointermove", p.move);
      if (p.up) replay("pointerup", p.up);
    });
  };
  createEffect(() => {
    if (tree.movesEnabled()) untrack(loadDnd);
  });
  onCleanup(() => {
    disposed = true;
    stopBuffering();
    dnd?.dispose();
  });
  const onPointerDown = (e: PointerEvent, row: FlatRow) => {
    if (!tree.movesEnabled()) return;
    if (dnd) return dnd.onPointerDown(e, row);
    if (!pending) {
      window.addEventListener("pointermove", bufferMove, true);
      window.addEventListener("pointerup", bufferUp, true);
    }
    pending = { down: [e, row] };
    loadDnd();
  };

  const mounted = createMemo(() => (opts.renderedRows?.() ?? tree.flatRows()).filter((r) => r.navigable));

  /**
   * The row that takes Tab focus. It remembers the last focused row even while that row
   * is scrolled out of a virtual window (ANALYSIS E5); the root then becomes the Tab stop
   * and forwards focus to it.
   */
  const tabbableId = createMemo(() => {
    const visible = tree.flatRows();
    const has = (id: string | null | undefined) => !!id && visible.some((r) => r.id === id && r.navigable);
    const f = focusedId();
    if (has(f)) return f!;
    const sel = tree.selectedId();
    if (has(sel)) return sel!;
    return visible.find((r) => r.navigable)?.id;
  });
  const tabbableMounted = () => {
    const id = tabbableId();
    return !!id && mounted().some((r) => r.id === id);
  };

  const findElement = (id: string) =>
    Array.from(opts.getContainer()?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? []).find((el) => el.dataset.treeId === id);

  const focusWhenRendered = (id: string, request: number, frames = 4) => {
    queueMicrotask(() => {
      if (request !== focusRequest) return;
      const el = findElement(id);
      if (el) return el.focus();
      if (frames <= 0) return;
      const win = opts.getContainer()?.ownerDocument.defaultView;
      if (win?.requestAnimationFrame) win.requestAnimationFrame(() => focusWhenRendered(id, request, frames - 1));
      else setTimeout(() => focusWhenRendered(id, request, frames - 1), 0);
    });
  };

  /** Focus a row, scrolling it into the window only if it is not already rendered (E6). */
  const focusRow = (id: string) => {
    const rows = tree.flatRows();
    const index = rows.findIndex((r) => r.id === id && r.navigable);
    if (index < 0) return;
    setFocusedId(id);
    focusRequest += 1;
    if (!findElement(id)) opts.ensureRowVisible?.(index);
    focusWhenRendered(id, focusRequest);
  };

  const select = (id: string, e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    if (e?.shiftKey) tree.selectRange(id);
    else if (e?.ctrlKey || e?.metaKey) tree.toggleSelected(id);
    else tree.select(id);
  };

  const onKeyDown = (event: KeyboardEvent, row: FlatRow) => {
    if (event.target !== event.currentTarget) return; // a control inside the row owns its keys
    const rows = tree.flatRows();
    // A failed branch is retried from its parent row (placeholders take no focus).
    if ((event.key === "Enter" || event.key === "ArrowRight") && row.expanded && lazy.error?.(row.id)) {
      event.preventDefault();
      void lazy.retry?.(row.id);
      return;
    }
    if (event.key === "F2" && tree.canRenameNode(row.id)) {
      event.preventDefault();
      tree.startEditing(row.id);
      return;
    }
    if (event.key === " " && tree.isCheckable(row.id)) {
      event.preventDefault();
      tree.toggleChecked(row.id);
      return;
    }
    if (event.ctrlKey && event.shiftKey && event.key.startsWith("Arrow") && tree.movesEnabled()) {
      event.preventDefault();
      void keyboardMove(event.key, row.id).then(() => focusRow(row.id));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      tree.selectAll();
      return;
    }
    if (isTypeaheadKey(event)) {
      const next = typeahead(typed, event.key, Date.now(), rows, row.id, (id) => tree.index().get(id)?.label ?? "");
      typed = next.state;
      if (next.focusId) {
        event.preventDefault();
        focusRow(next.focusId);
      }
      return;
    }
    const action = resolveKey(event.key, row.id, rows, {
      rtl: !!opts.rtl?.(),
      isDisabled: (id) => !!tree.index().get(id)?.disabled,
    });
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.toggleId) tree.toggle(action.toggleId);
    for (const id of action.expandIds ?? []) tree.expand(id);
    if (action.selectId) {
      select(action.selectId, event);
      if (event.key === "Enter") tree.activate(action.selectId);
    }
    if (action.focusId) {
      // Shift+Arrow extends a multi-selection as focus moves.
      if (event.shiftKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) tree.selectRange(action.focusId);
      focusRow(action.focusId);
    }
  };

  const onRowClick = (event: MouseEvent, row: FlatRow) => {
    if (dnd?.suppressClick()) return; // the click that ends a drag
    if (row.kind === "placeholder") {
      if (row.placeholder === "error") void lazy.retry?.(row.parentId); // null parentId = the roots
      return;
    }
    if (row.kind !== "node") return;
    focusRow(row.id);
    const wasSelected = tree.selectedIds().has(row.id);
    const wasExpanded = row.expanded;
    select(row.id, event);
    const policy = opts.rowClickPolicy?.() ?? "finder";
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey && shouldToggleFromRowClick(policy, row.hasChildren, wasSelected, wasExpanded)) {
      tree.toggle(row.id);
    }
  };

  const liveMessage = createMemo(() => {
    if (announcement()) return announcement();
    if (!tree.searching()) return "";
    const n = tree.matchCount();
    return n === 0 ? "No matches" : n === 1 ? "1 match" : `${n} matches`;
  });

  return {
    tabbableId,
    focusedId,
    focusRow,
    liveMessage,
    /** The current drop target while dragging (for custom indicators). */
    drop,
    draggingIds,
    /** Programmatic move with announcement (used by keyboard moves). */
    moveWithAnnouncement: doMove,

    getRootProps<E extends HTMLElement = HTMLElement>(): ElementProps<E> {
      return {
        role: "tree",
        get "aria-label"() {
          return opts.ariaLabel?.();
        },
        get "aria-labelledby"() {
          return opts.ariaLabelledBy?.();
        },
        get "aria-multiselectable"() {
          return tree.selectionMode?.() === "multiple" ? true : undefined;
        },
        get "data-searching"() {
          return tree.searching() ? "" : undefined;
        },
        // When the remembered row is scrolled out of a virtual window, the root itself
        // is the Tab stop and hands focus to that row (E5).
        get tabIndex() {
          return tabbableMounted() ? undefined : tabbableId() ? 0 : undefined;
        },
        onFocus: (e: FocusEvent) => {
          if (e.target === e.currentTarget && tabbableId()) focusRow(tabbableId()!);
        },
      } as ElementProps<E>;
    },

    /** Props for a node row's treeitem element. `row` is an accessor (rows can be reused). */
    getItemProps<E extends HTMLElement = HTMLElement>(row: Accessor<FlatRow>): ItemProps<E> {
      const r = row;
      const isSelected = () => tree.selectedIds().has(r().id);
      return {
        get role() {
          return "treeitem";
        },
        get "aria-level"() {
          return r().level;
        },
        get "aria-posinset"() {
          return r().posinset || undefined;
        },
        get "aria-setsize"() {
          return r().setsize || undefined;
        },
        get "aria-selected"() {
          return r().kind === "node" ? isSelected() : undefined;
        },
        get "aria-expanded"() {
          return r().hasChildren ? r().expanded : undefined;
        },
        get "aria-disabled"() {
          return r().kind !== "node" || r().node.disabled ? true : undefined;
        },
        get "aria-checked"() {
          if (r().kind !== "node" || !tree.isCheckable(r().id)) return undefined;
          const st = tree.checkState(r().id);
          return st === "mixed" ? "mixed" : st === "checked";
        },
        get "data-drop"() {
          const d = drop();
          return d && d.target === r().id ? d.position : undefined;
        },
        get "data-dragging"() {
          return draggingIds().has(r().id) ? "" : undefined;
        },
        get "aria-busy"() {
          return r().expanded && lazy.loading?.(r().id) ? true : undefined;
        },
        get tabIndex() {
          return r().kind === "node" && tabbableId() === r().id ? 0 : -1;
        },
        get "data-tree-id"() {
          return r().id;
        },
        get "data-selected"() {
          return isSelected() ? "" : undefined;
        },
        get "data-focused"() {
          return focusedId() === r().id ? "" : undefined;
        },
        onClick: (e: MouseEvent) => onRowClick(e, r()),
        onPointerDown: (e: PointerEvent) => onPointerDown(e, r()),
        onDblClick: () => {
          if (r().kind === "node" && !r().node.disabled) tree.activate(r().id);
        },
        onKeyDown: (e: KeyboardEvent) => onKeyDown(e, r()),
        onFocus: (e: FocusEvent) => {
          if (e.target === e.currentTarget && r().kind === "node") setFocusedId(r().id);
        },
      } as ItemProps<E>;
    },

    /** Props for a chevron/toggle element inside a row (toggles without selecting). */
    getToggleProps<E extends HTMLElement = HTMLElement>(row: Accessor<FlatRow>): ElementProps<E> {
      return {
        "aria-hidden": "true",
        onClick: (e: MouseEvent) => {
          e.stopPropagation();
          tree.toggle(row().id);
        },
      } as ElementProps<E>;
    },

    /** Props for a polite live region that announces search results (E2). */
    getLiveRegionProps<E extends HTMLElement = HTMLElement>(): ElementProps<E> {
      return {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        class: "solid-tree-live",
        style: { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", "white-space": "nowrap" },
      } as ElementProps<E>;
    },
  };
}

export type TreeViewApi = ReturnType<typeof createTreeView>;
