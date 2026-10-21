import { createMemo, createSignal, onCleanup, untrack, type Accessor, type JSX } from "solid-js";
import type { TreeController } from "../../controller/index.js";
import { isTypeaheadKey, resolveKey, typeahead, type DropPosition, type TypeaheadState } from "../../core/index.js";
import type { FlatRow, TreeRowClickPolicy } from "../../types.js";
import { shouldToggleFromRowClick } from "../navigation.js";

/** What the database tier adds, detected structurally so the core view stays generic. */
interface MaybeLazy {
  loading?(id: string | null): boolean;
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
  interface Drag {
    pointerId: number;
    rowId: string;
    sources: string[];
    x: number;
    y: number;
    started: boolean;
    touch: boolean;
    timer?: ReturnType<typeof setTimeout>;
    hoverTimer?: ReturnType<typeof setTimeout>;
    hoverId?: string;
    raf?: number;
  }
  const [drop, setDrop] = createSignal<{ target: string; position: DropPosition } | null>(null);
  const [draggingIds, setDraggingIds] = createSignal<ReadonlySet<string>>(new Set());
  let drag: Drag | null = null;
  let suppressClick = false;

  const scrollParent = (): HTMLElement | null => {
    let el: HTMLElement | null = opts.getContainer() ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  };

  const computeDrop = () => {
    if (!drag?.started) return;
    const doc = opts.getContainer()?.ownerDocument ?? document;
    const hit = doc.elementFromPoint(drag.x, drag.y) as HTMLElement | null;
    const el = hit?.closest<HTMLElement>("[data-tree-id]");
    const target = el && opts.getContainer()?.contains(el) ? el.dataset.treeId! : null;
    const row = target ? tree.flatRows().find((r) => r.id === target) : undefined;
    if (!el || !row || row.kind !== "node") return setDrop(null);
    const rect = el.getBoundingClientRect();
    const rel = (drag.y - rect.top) / Math.max(1, rect.height);
    const insideOk = tree.canMoveTo(drag.sources, row.id, "inside");
    const position: DropPosition = insideOk ? (rel < 0.25 ? "before" : rel > 0.75 ? "after" : "inside") : rel < 0.5 ? "before" : "after";
    if (!tree.canMoveTo(drag.sources, row.id, position)) return setDrop(null);
    setDrop({ target: row.id, position });
    // Hovering "inside" a collapsed parent opens it after 600 ms.
    if (position === "inside" && row.hasChildren && !row.expanded) {
      if (drag.hoverId !== row.id) {
        clearTimeout(drag.hoverTimer);
        drag.hoverId = row.id;
        drag.hoverTimer = setTimeout(() => drag && tree.expand(row.id), 600);
      }
    } else {
      clearTimeout(drag.hoverTimer);
      drag.hoverId = undefined;
    }
  };

  const autoScroll = () => {
    if (!drag?.started) return;
    const sp = scrollParent();
    if (sp) {
      const r = sp.getBoundingClientRect();
      const edge = 20;
      const dy = drag.y < r.top + edge ? -(r.top + edge - drag.y) : drag.y > r.bottom - edge ? drag.y - (r.bottom - edge) : 0;
      if (dy) {
        sp.scrollTop += Math.sign(dy) * Math.min(24, 4 + Math.abs(dy));
        computeDrop(); // rows moved under a still pointer (and virtual rows recycled)
      }
    }
    drag.raf = requestAnimationFrame(autoScroll);
  };

  const startDrag = () => {
    if (!drag) return;
    drag.started = true;
    setDraggingIds(new Set(drag.sources));
    computeDrop();
    drag.raf = requestAnimationFrame(autoScroll);
  };

  const endDrag = (commit: boolean) => {
    const d = drag;
    drag = null;
    if (!d) return;
    clearTimeout(d.timer);
    clearTimeout(d.hoverTimer);
    if (d.raf) cancelAnimationFrame(d.raf);
    window.removeEventListener("pointermove", onWindowMove, true);
    window.removeEventListener("pointerup", onWindowUp, true);
    window.removeEventListener("pointercancel", onWindowCancel, true);
    window.removeEventListener("keydown", onWindowKey, true);
    const target = untrack(drop);
    setDrop(null);
    setDraggingIds(new Set<string>());
    if (d.started) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      if (commit && target) void doMove(d.sources, target.target, target.position).then(() => focusRow(d.rowId));
    }
  };
  const onWindowMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.started) {
      if (drag.touch) {
        if (dist > 8) endDrag(false); // a scroll gesture, not a long press
        return;
      }
      if (dist < 5) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      startDrag();
      return;
    }
    e.preventDefault();
    drag.x = e.clientX;
    drag.y = e.clientY;
    computeDrop();
  };
  const onWindowUp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) endDrag(true);
  };
  const onWindowCancel = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) endDrag(false);
  };
  const onWindowKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && drag) {
      e.preventDefault();
      endDrag(false);
    }
  };
  onCleanup(() => endDrag(false));

  const onPointerDown = (e: PointerEvent, row: FlatRow) => {
    if (!tree.movesEnabled() || row.kind !== "node" || row.node.disabled || e.button !== 0) return;
    if (tree.editingId() === row.id) return;
    drag = { pointerId: e.pointerId, rowId: row.id, sources: movingSources(row.id), x: e.clientX, y: e.clientY, started: false, touch: e.pointerType === "touch" };
    window.addEventListener("pointermove", onWindowMove, true);
    window.addEventListener("pointerup", onWindowUp, true);
    window.addEventListener("pointercancel", onWindowCancel, true);
    window.addEventListener("keydown", onWindowKey, true);
    if (drag.touch) drag.timer = setTimeout(startDrag, 400);
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
    if (suppressClick) return; // the click that ends a drag
    if (row.kind === "placeholder") {
      if (row.placeholder === "error" && row.parentId !== null) void lazy.retry?.(row.parentId);
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
