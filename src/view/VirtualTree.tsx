import { Component, For, Show, createMemo, createSignal, createEffect, onMount, JSX } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { TreeContext } from "./context.js";
import { type FlatRow } from "../types.js";
import { createTreeController, type TreeController } from "../controller/index.js";
import { controllerOptionsFromProps, ctxFromController, warnIfTreeOverridesProps, type CoreViewProps } from "./Tree.js";
import { buildContainerVars } from "./tokens.js";
import { TreeRow } from "./TreeRow.js";
import { createTreeInteraction } from "./interaction.js";

export interface VirtualTreeProps extends CoreViewProps {
  /** Drive this view with an external controller; omit to build one from the props. */
  tree?: TreeController;
  /**
   * INITIAL row-height guess (px) before anything is measured. Default 28. You
   * rarely need to set it — once rows render, the estimate self-tunes to a running
   * average of measured heights. Set it only to reduce the very first paint's guess
   * (e.g. ~60 for tall multi-line rows).
   */
  estimateSize?: number;
  /** Rows rendered beyond the visible window. Default 6. */
  overscan?: number;
  /** Class on the scroll viewport (give it a bounded height somehow). */
  class?: string;
  /** Extra inline style merged onto the scroll viewport (e.g. a fixed height). */
  viewportStyle?: JSX.CSSProperties;
  /**
   * Fires with the first/last visible flat-row index whenever the window moves.
   * The seam `<DatabaseTree>` uses to lazy-load / page. (Pure: just reports.)
   */
  onRangeChange?: (startIndex: number, endIndex: number) => void;
}

// Minimal shape we use off a virtual item (the patched adapter is untyped).
interface VItem {
  index: number;
  start: number;
}

// One windowed row. The virtualizer reconciles BY INDEX, so this <div> is REUSED
// when expand/scroll puts a different node in the slot — the ref fires only once.
// Measurements cache by node id, so we must re-measure both on mount (ref) AND
// whenever the slot's node id changes (effect), or a reused row keeps the estimate.
// `measure` is microtask-deferred upstream (no reentrancy, no flash).
const VirtualRow: Component<{
  vi: VItem;
  row: () => FlatRow | undefined;
  measure: (el: HTMLElement) => void;
}> = (props) => {
  let el: HTMLDivElement | undefined;
  const remeasure = () => {
    if (el) props.measure(el);
  };
  createEffect(() => {
    void props.row()?.node.id; // re-run when this slot renders a different node
    remeasure();
  });
  return (
    <div
      data-index={props.vi.index}
      ref={(n) => {
        el = n;
        remeasure();
      }}
      style={`position:absolute; top:0; left:0; width:100%; transform:translateY(${props.vi.start}px)`}
    >
      <Show when={props.row()}>{(r) => <TreeRow node={r().node} depth={r().depth} hasChildren={r().hasChildren} />}</Show>
    </div>
  );
};

/**
 * Windowed tree — `<Tree>` for big in-memory data. Same API + tokens; renders only
 * the visible slice via @tanstack/solid-virtual. REQUIRES a bounded-height
 * viewport (give it `class`/`viewportStyle` with a height, or a sized parent).
 * Async/data-source concerns live one tier up in `<DatabaseTree>`.
 */
export const VirtualTree: Component<VirtualTreeProps> = (props) => {
  warnIfTreeOverridesProps(props, "VirtualTree");
  const tree = props.tree ?? createTreeController(controllerOptionsFromProps(props));

  // The flat visible row list — memoized in the view (controller recomputes on read).
  const rows = createMemo(() => tree.flatRows());

  // GOTCHA: publish the scroll element in onMount, not the ref — Solid builds DOM
  // from a <template> whose ownerDocument.defaultView is null, which the adapter
  // would cache as targetWindow=null (blank list, dead scroll). By onMount the node
  // is adopted into the live document. (See docs/SPEC-virtualtree.md.)
  let viewportEl: HTMLDivElement | undefined;
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();
  onMount(() => {
    if (viewportEl) setScrollEl(viewportEl);
  });

  // Self-tuning estimate: prop seeds the initial guess; a running average of
  // measured heights then drives the estimate for un-measured rows. Measured rows
  // always use their own cached size; this only affects rows not yet measured.
  let sizeSum = 0;
  let sizeCount = 0;
  const [estimate, setEstimate] = createSignal(props.estimateSize ?? 28);

  const virtualizer = createVirtualizer({
    get count() {
      return rows().length;
    },
    getScrollElement: () => scrollEl() ?? null,
    estimateSize: () => estimate(),
    getItemKey: (i: number) => rows()[i]?.node.id ?? i, // persistent id = measurement cache key
    get overscan() {
      return props.overscan ?? 6;
    },
  });

  const interaction = createTreeInteraction({
    tree,
    getContainer: () => viewportEl,
    renderedRows: () =>
      virtualizer
        .getVirtualItems()
        .map((item: VItem) => rows()[item.index])
        .filter((row: FlatRow | undefined): row is FlatRow => !!row),
    ensureRowVisible: (index) => virtualizer.scrollToIndex(index, { align: "auto" }),
  });
  const ctx = ctxFromController(tree, props, interaction);

  // Measure a row + feed the running-average estimate. Deferred to a microtask:
  // past the synchronous render (avoids measure→notify→re-render reentrancy) but
  // before paint (no estimate flash).
  const measure = (el: HTMLElement) =>
    queueMicrotask(() => {
      virtualizer.measureElement(el);
      const h = el.getBoundingClientRect().height;
      if (h > 0) {
        sizeSum += h;
        sizeCount += 1;
        setEstimate(Math.round(sizeSum / sizeCount));
      }
    });

  // Lazy-paging seam: report the visible window upward.
  createEffect(() => {
    const items = virtualizer.getVirtualItems();
    if (items.length && props.onRangeChange) {
      props.onRangeChange(items[0].index, items[items.length - 1].index);
    }
  });

  return (
    <div
      ref={(el) => (viewportEl = el)}
      class={`solid-tree-container solid-tree-viewport${props.class ? " " + props.class : ""}`}
      role="tree"
      aria-label={props.ariaLabel}
      aria-labelledby={props.ariaLabelledBy}
      data-searching={tree.searching() ? "" : undefined}
      style={{
        // Bounded-height scroll viewport. overflow-anchor:none keeps dynamic
        // measurement from fighting the browser's scroll anchoring. Token layer
        // (containerVars) lives here so the rows inherit the --tree-* vars.
        display: "block",
        overflow: "auto",
        "overflow-anchor": "none",
        height: "100%",
        ...buildContainerVars(props.basePadding, props.indentStep),
        ...(props.viewportStyle ?? {}),
      }}
    >
      <TreeContext.Provider value={ctx}>
        <Show
          when={!tree.noMatches()}
          fallback={<div class="solid-tree-empty">{props.noMatchesLabel ?? "No matches"}</div>}
        >
          <div style={`position:relative; width:100%; height:${virtualizer.getTotalSize()}px`}>
            <For each={virtualizer.getVirtualItems()}>
              {(vi: VItem) => <VirtualRow vi={vi} row={() => rows()[vi.index]} measure={measure} />}
            </For>
          </div>
        </Show>
      </TreeContext.Provider>
    </div>
  );
};
