import { untrack, type Accessor } from "solid-js";
import type { TreeController } from "../../controller/index.js";
import type { DropPosition } from "../../core/index.js";
import type { FlatRow } from "../../types.js";

// Pointer drag-and-drop (SPEC-features 7.4). Loaded on demand by createTreeView only
// when moves are enabled (`onMove`), so apps that never drag do not ship this code.

export type Drop = { target: string; position: DropPosition };

export interface DndHost {
  tree: TreeController;
  getContainer: () => HTMLElement | undefined;
  movingSources(id: string): string[];
  doMove(sources: string[], target: string, position: DropPosition): Promise<boolean>;
  focusRow(id: string): void;
  drop: Accessor<Drop | null>;
  setDrop(d: Drop | null): void;
  setDraggingIds(ids: ReadonlySet<string>): void;
}

export interface DragAndDrop {
  onPointerDown(e: PointerEvent, row: FlatRow): void;
  /** True for the click that ends a drag (it must not select). */
  suppressClick(): boolean;
  dispose(): void;
}

export function createDragAndDrop(host: DndHost): DragAndDrop {
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
  let drag: Drag | null = null;
  let suppressClick = false;

  const scrollParent = (): HTMLElement | null => {
    let el: HTMLElement | null = host.getContainer() ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  };

  const computeDrop = () => {
    if (!drag?.started) return;
    const doc = host.getContainer()?.ownerDocument ?? document;
    const hit = doc.elementFromPoint(drag.x, drag.y) as HTMLElement | null;
    const el = hit?.closest<HTMLElement>("[data-tree-id]");
    const target = el && host.getContainer()?.contains(el) ? el.dataset.treeId! : null;
    const row = target ? host.tree.flatRows().find((r) => r.id === target) : undefined;
    if (!el || !row || row.kind !== "node") return host.setDrop(null);
    const rect = el.getBoundingClientRect();
    const rel = (drag.y - rect.top) / Math.max(1, rect.height);
    const insideOk = host.tree.canMoveTo(drag.sources, row.id, "inside");
    const position: DropPosition = insideOk ? (rel < 0.25 ? "before" : rel > 0.75 ? "after" : "inside") : rel < 0.5 ? "before" : "after";
    if (!host.tree.canMoveTo(drag.sources, row.id, position)) return host.setDrop(null);
    host.setDrop({ target: row.id, position });
    // Hovering "inside" a collapsed parent opens it after 600 ms.
    if (position === "inside" && row.hasChildren && !row.expanded) {
      if (drag.hoverId !== row.id) {
        clearTimeout(drag.hoverTimer);
        drag.hoverId = row.id;
        drag.hoverTimer = setTimeout(() => drag && host.tree.expand(row.id), 600);
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
    host.setDraggingIds(new Set(drag.sources));
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
    const target = untrack(host.drop);
    host.setDrop(null);
    host.setDraggingIds(new Set<string>());
    if (d.started) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      if (commit && target) void host.doMove(d.sources, target.target, target.position).then(() => host.focusRow(d.rowId));
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

  const onPointerDown = (e: PointerEvent, row: FlatRow) => {
    if (!host.tree.movesEnabled() || row.kind !== "node" || row.node.disabled || e.button !== 0) return;
    if (host.tree.editingId() === row.id) return;
    drag = { pointerId: e.pointerId, rowId: row.id, sources: host.movingSources(row.id), x: e.clientX, y: e.clientY, started: false, touch: e.pointerType === "touch" };
    window.addEventListener("pointermove", onWindowMove, true);
    window.addEventListener("pointerup", onWindowUp, true);
    window.addEventListener("pointercancel", onWindowCancel, true);
    window.addEventListener("keydown", onWindowKey, true);
    if (drag.touch) drag.timer = setTimeout(startDrag, 400);
  };

  return {
    onPointerDown,
    suppressClick: () => suppressClick,
    dispose: () => endDrag(false),
  };
}
