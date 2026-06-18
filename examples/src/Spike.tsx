// THROWAWAY spike — prove the @tanstack/solid-virtual adapter pattern before
// building <VirtualTree>. Validates: getter-options reactivity, windowing (only
// a small DOM slice), dynamic variable-height measurement, scrollToIndex, and a
// reactive count change that does NOT recreate the virtualizer.
//   Mount via http://localhost:5180/?spike
import { createSignal, onMount, For, type Component } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual"; // STOCK 3.13.x

// GOTCHA: the scroll element must be a SIGNAL, not a plain `let` ref. The adapter
// reads getScrollElement inside a createComputed; with a plain ref that's null on
// first read, observers never attach and getVirtualItems() stays empty. A signal
// makes getScrollElement reactive → re-attaches when the ref mounts.

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

  // THE FIX: capture the element with a plain ref, but publish it to the signal
  // only in onMount — by then Solid has adopted the node from its <template> into
  // the live document, so ownerDocument.defaultView is the real window (not null).
  // Setting it in the ref (still template-owned) cached targetWindow=null forever.
  let el!: HTMLDivElement;
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();
  onMount(() => setScrollEl(el));

  // Created ONCE. Reactive fields via getters — the adapter's internal
  // createComputed re-reads them, so changing rows()/scrollEl() re-windows WITHOUT
  // recreating the virtualizer (scroll + measurement cache survive).
  const virtualizer = createVirtualizer({
    get count() {
      return rows().length;
    },
    getScrollElement: () => scrollEl() ?? null,
    estimateSize: () => 44,
    getItemKey: (i) => rows()[i].id, // persistent id, not index
    overscan: 6,
  });

  // DEBUG: introspect from the preview console.
  (window as any).__v = virtualizer;
  (window as any).__scrollEl = scrollEl;

  return (
    <div style="font-family:system-ui;padding:16px;max-width:560px">
      <h2>solid-virtual spike</h2>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button id="b-top" onClick={() => virtualizer.scrollToIndex(0)}>top</button>
        <button id="b-mid" onClick={() => virtualizer.scrollToIndex(Math.floor(rows().length / 2), { align: "center" })}>middle</button>
        <button id="b-end" onClick={() => virtualizer.scrollToIndex(rows().length - 1, { align: "end" })}>end</button>
        <button id="b-add" onClick={() => setRows((r) => [...r, ...makeRows(2000, r.length)])}>+2000</button>
      </div>
      <div id="meta">
        count={rows().length} · totalSize={Math.round(virtualizer.getTotalSize())} · domRows=
        <span id="domrows">{virtualizer.getVirtualItems().length}</span>
      </div>
      <div
        ref={el}
        class="vp"
        style="height:380px;overflow-y:auto;overflow-anchor:none;border:1px solid #ccc;border-radius:8px;margin-top:8px"
      >
        <div style={`position:relative;width:100%;height:${virtualizer.getTotalSize()}px`}>
          <For each={virtualizer.getVirtualItems()}>
            {(vi) => {
              const row = () => rows()[vi.index];
              return (
                <div
                  class="vrow"
                  // Reactive attr keeps data-index correct when this DOM node is
                  // reused for a different row on scroll (ref fires only once).
                  data-index={vi.index}
                  // GOTCHA: measureElement reads the data-index ATTRIBUTE, but Solid
                  // applies a dynamic data-index in an effect that runs AFTER the ref
                  // fires → measureElement reads null → getItemKey(NaN) → crash. Set
                  // the attribute in the ref, before handing the node to measureElement.
                  ref={(el) => {
                    el.setAttribute("data-index", String(vi.index));
                    // GOTCHA: measureElement synchronously notifies → setStore →
                    // re-runs this <For> mapper mid-render → current vi becomes
                    // undefined → crash. Defer it out of the render pass.
                    requestAnimationFrame(() => virtualizer.measureElement(el));
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
