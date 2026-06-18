// Runnable proof of docs/SPEC-virtualtree.md — validates the @tanstack/solid-virtual
// integration that <VirtualTree> will be built on. Mount via /?spike.
//
// Verified (stock @tanstack/solid-virtual 3.13.x, real browser, prod build):
//   • windowing — only a small DOM slice of 5000 rows is rendered
//   • variable row height — measured live via measureElement (1–3 line rows)
//   • scroll re-windows · scrollToIndex · reactive count growth (no recreation)
//
// The three gotchas it pins down (each cost real debugging — see comments inline):
//   1. publish the scroll element in onMount, not in the ref (template defaultView)
//   2. data-index: reactive attr + set in ref (measureElement reads the attribute)
//   3. defer measureElement with rAF (sync call re-enters the <For> → crash)
import { createSignal, onMount, For, type Component } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";

interface Row {
  id: string;
  i: number;
  lines: number; // 1–3 → variable height, like our 1/3-line tree rows
}

const makeRows = (n: number, seed = 0): Row[] =>
  Array.from({ length: n }, (_, k) => {
    const i = seed + k;
    return { id: "r" + i, i, lines: 1 + ((i * 7) % 3) };
  });

export const Spike: Component = () => {
  const [rows, setRows] = createSignal<Row[]>(makeRows(5000));

  // GOTCHA 1: capture the element with a plain ref, but publish it to the signal
  // only in onMount. Solid builds DOM from a <template>, so at ref-time the node's
  // ownerDocument.defaultView is null → the adapter caches targetWindow=null and
  // never re-resolves → blank list, dead scroll. By onMount the node is adopted
  // into the live document, so defaultView is the real window.
  let el!: HTMLDivElement;
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();
  onMount(() => setScrollEl(el));

  // Created ONCE (never in a memo). Reactive fields via getters — the adapter
  // re-reads them, so growing rows() re-windows WITHOUT recreating the virtualizer.
  const virtualizer = createVirtualizer({
    get count() {
      return rows().length;
    },
    getScrollElement: () => scrollEl() ?? null,
    estimateSize: () => 44,
    getItemKey: (i) => rows()[i].id, // persistent id, not index (measurement cache key)
    overscan: 6,
  });

  return (
    <div style="font-family:system-ui;padding:16px;max-width:560px">
      <h2>solid-virtual spike</h2>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button onClick={() => virtualizer.scrollToIndex(0)}>top</button>
        <button onClick={() => virtualizer.scrollToIndex(Math.floor(rows().length / 2), { align: "center" })}>
          middle
        </button>
        <button onClick={() => virtualizer.scrollToIndex(rows().length - 1, { align: "end" })}>end</button>
        <button onClick={() => setRows((r) => [...r, ...makeRows(2000, r.length)])}>+2000</button>
      </div>
      <div style="font-size:13px;color:#555;margin-bottom:8px">
        count={rows().length} · totalSize={Math.round(virtualizer.getTotalSize())} · windowed=
        {virtualizer.getVirtualItems().length} rows in DOM
      </div>
      <div
        ref={el}
        class="vp"
        // VirtualTree's container contract: explicit height + overflow + overflow-anchor:none.
        style="height:380px;overflow-y:auto;overflow-anchor:none;border:1px solid #ccc;border-radius:8px"
      >
        <div style={`position:relative;width:100%;height:${virtualizer.getTotalSize()}px`}>
          <For each={virtualizer.getVirtualItems()}>
            {(vi) => {
              const row = () => rows()[vi.index];
              return (
                <div
                  class="vrow"
                  // GOTCHA 2: keep data-index correct when this node is reused for a
                  // different row on scroll (reactive attr) AND set it in the ref so
                  // it's present for the first measureElement (Solid applies the
                  // dynamic attr in an effect that runs after the ref → else NaN key).
                  data-index={vi.index}
                  ref={(node) => {
                    node.setAttribute("data-index", String(vi.index));
                    // GOTCHA 3: measureElement synchronously notifies → setStore →
                    // re-runs this <For> mid-render → current vi undefined → crash.
                    // Defer it out of the render pass.
                    requestAnimationFrame(() => virtualizer.measureElement(node));
                  }}
                  style={`position:absolute;top:0;left:0;width:100%;box-sizing:border-box;padding:8px 12px;border-bottom:1px solid #eee;transform:translateY(${vi.start}px)`}
                >
                  <strong>#{row().i}</strong>
                  <For each={Array.from({ length: row().lines })}>
                    {(_, k) => <div>line {k() + 1} — variable-height row to test measureElement</div>}
                  </For>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
};
