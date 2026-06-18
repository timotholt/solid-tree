import { Component, For, Show, createMemo, createSignal, createEffect, onMount } from "solid-js";
import { createVirtualizer } from "./createVirtualizer.js"; // #1203-patched (preserves measurements on expand)
import { TreeContext } from "./context.js";
import { type TreeProps } from "./types.js";
import { createTreeState } from "./state.js";
import { flattenVisible } from "./search.js";
import { TreeRow } from "./TreeRow.jsx";

export interface VirtualTreeProps extends TreeProps {
  /**
   * Estimated row height (px) before measurement. Default 28 (a single-line row).
   * Tune it to your COMMON row — multi-line rows should pass a larger value, or
   * off-screen/just-rendered rows briefly use this estimate before measuring.
   */
  estimateSize?: number;
  /** Rows rendered beyond the visible window. Default 6. */
  overscan?: number;
  /** Class on the scroll viewport (give it a bounded height somehow). */
  class?: string;
  /** Inline style merged onto the scroll viewport (e.g. a fixed height). */
  viewportStyle?: string;
  /**
   * Fires with the first/last visible flat-row index whenever the window moves.
   * The seam `<DatabaseTree>` uses to lazy-load / page. (Pure: just reports.)
   */
  onRangeChange?: (startIndex: number, endIndex: number) => void;
}

/**
 * Windowed tree — `<Tree>` for big in-memory data. Same API + tokens; renders only
 * the visible slice via @tanstack/solid-virtual. REQUIRES a bounded-height
 * viewport (give it `class`/`viewportStyle` with a height, or a sized parent).
 * Async/data-source concerns live one tier up in `<DatabaseTree>`.
 */
export const VirtualTree: Component<VirtualTreeProps> = (props) => {
  const s = createTreeState(props);

  // The flat visible row list — the same linearization <Tree> walks recursively.
  const rows = createMemo(() => flattenVisible(s.view().data, s.effectiveExpanded()));

  // GOTCHA: publish the scroll element in onMount, not the ref — Solid builds DOM
  // from a <template> whose ownerDocument.defaultView is null, which the adapter
  // would cache as targetWindow=null (blank list, dead scroll). By onMount the node
  // is adopted into the live document. (See docs/SPEC-virtualtree.md.)
  let viewportEl: HTMLDivElement | undefined;
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();
  onMount(() => {
    if (viewportEl) setScrollEl(viewportEl);
  });

  // Created once (never in a memo). Reactive fields via getters.
  const virtualizer = createVirtualizer({
    get count() {
      return rows().length;
    },
    getScrollElement: () => scrollEl() ?? null,
    estimateSize: () => props.estimateSize ?? 28,
    getItemKey: (i: number) => rows()[i]?.node.id ?? i, // persistent id = measurement cache key
    get overscan() {
      return props.overscan ?? 6;
    },
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
      data-searching={s.searching() ? "" : undefined}
      // Bounded-height scroll viewport. overflow-anchor:none keeps dynamic
      // measurement from fighting the browser's scroll anchoring.
      style={`display:block; overflow:auto; overflow-anchor:none; height:100%;${props.viewportStyle ?? ""}`}
    >
      <div style={objToStyle(s.containerVars() as Record<string, unknown>)}>
        <TreeContext.Provider value={s.ctx}>
          <Show
            when={!s.noMatches()}
            fallback={<div class="solid-tree-empty">{props.noMatchesLabel ?? "No matches"}</div>}
          >
            <div style={`position:relative; width:100%; height:${virtualizer.getTotalSize()}px`}>
              <For each={virtualizer.getVirtualItems()}>
                {(vi) => {
                  let el: HTMLDivElement | undefined;
                  const row = () => rows()[vi.index];
                  // The virtualizer reconciles rows BY INDEX, so a slot's <div> is
                  // REUSED when expand/scroll puts a different node in it — the ref
                  // fires only once. Measurements are cached by node id, so a reused
                  // row's new node would otherwise keep the estimate (only a
                  // scroll-out/in that recreates the DOM measured it). So measure
                  // BOTH on mount (ref) AND whenever the slot's node id changes
                  // (effect). Microtask defer dodges the measure→notify→re-render
                  // reentrancy crash and lands before paint (no estimate flash).
                  const remeasure = () => {
                    const node = el;
                    if (node) queueMicrotask(() => virtualizer.measureElement(node));
                  };
                  createEffect(() => {
                    row()?.node.id; // re-run when this slot renders a different node
                    remeasure();
                  });
                  return (
                    <div
                      data-index={vi.index}
                      ref={(n) => {
                        el = n;
                        remeasure();
                      }}
                      style={`position:absolute; top:0; left:0; width:100%; transform:translateY(${vi.start}px)`}
                    >
                      <Show when={row()}>{(r) => <TreeRow node={r().node} depth={r().depth} />}</Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </TreeContext.Provider>
      </div>
    </div>
  );
};

// Serialize the CSS-var object (containerVars) to a style string for the wrapper.
function objToStyle(o: Record<string, unknown>): string {
  return Object.entries(o)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}:${String(v)}`)
    .join(";");
}
