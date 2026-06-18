# Spec — `<VirtualTree>` (the dumb windowed tier)

Status: **adapter pattern PROVEN via spike** (branch `spike/virtual-adapter`,
`examples/src/Spike.tsx`, `?spike`). Validated on **stock `@tanstack/solid-virtual`
3.13.29** in a real Chrome tab: windowing (15–18 of 5000 rows), real measured rect,
scroll re-windows (offset 30210 → rows 670–687), `scrollToIndex`, reactive `count`
growth (5000→7000), dynamic `measureElement` (totalSize refined). Component not
built yet, but the exact working recipe + gotchas are below.

## VALIDATED gotchas (cost real debugging — bake these into VirtualTree)

1. **Scroll element must be published in `onMount`, NOT bound directly in the ref.**
   THE critical one. Solid builds DOM from a `<template>`, so at ref-time the node's
   `ownerDocument.defaultView` is `null` (inert template document). The adapter's
   reactive computed reads `getScrollElement` (via `_willUpdate`), so binding the
   element in the ref resolves `targetWindow = null` while still template-owned —
   and it never re-resolves after adoption → `scrollRect` stays 0×0, observers never
   attach, **blank list, no scroll**. Fix:
   ```tsx
   let el!: HTMLDivElement;
   const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();
   onMount(() => setScrollEl(el));          // adopted into live doc → defaultView = window
   const virtualizer = createVirtualizer({ getScrollElement: () => scrollEl() ?? null, ... });
   // <div ref={el} ...>
   ```
2. **`data-index`: set it BOTH reactively AND in the ref.** `measureElement` reads
   the `data-index` *attribute*; Solid applies a dynamic attr in an effect that runs
   AFTER the ref → initial read is `null` → `getItemKey(NaN)` → crash. So set it in
   the ref for the initial measure, AND keep a reactive `data-index={vi.index}` so it
   stays correct when the node is reused for a different row on scroll.
3. **Defer `measureElement` out of the render pass (rAF).** Calling it synchronously
   in the ref → `resizeItem` → `notify` → `setStore` → re-runs the `<For>` mapper
   mid-render → current `vi` is undefined → crash. `requestAnimationFrame(() => virtualizer.measureElement(el))`.
4. **Create the virtualizer once** at top level (never in a memo). Reactive fields via
   getters (`get count()`). `getVirtualItems()`/`getTotalSize()` are reactive (Proxy).
5. **`getItemKey: i => rows()[i].id`** (persistent id) — heights cache by key; our
   prune rebuilds node objects each keystroke, so index/ref keys thrash.
6. NOT needed: PR #1203 (`measure()`→`_willUpdate()`) — that's a *different* bug
   (measurement preservation); irrelevant once gotcha #1 is applied. `initialRect`
   also unneeded once #1 is fixed (it only papered over the rect, not scroll).
7. `contain: strict` not required; `overflow-anchor: none` still recommended for
   dynamic-height scroll stability.

The working spike row:
```tsx
<For each={virtualizer.getVirtualItems()}>
  {(vi) => (
    <div
      data-index={vi.index}
      ref={(el) => { el.setAttribute("data-index", String(vi.index));
                     requestAnimationFrame(() => virtualizer.measureElement(el)); }}
      style={`position:absolute;top:0;left:0;width:100%;transform:translateY(${vi.start}px)`}
    >
      <TreeRow node={rows()[vi.index].node} depth={rows()[vi.index].depth} />
    </div>
  )}
</For>
```

---

## (original speculative notes follow — superseded by the validated section above)

## What it is
`<Tree>` for big data. Same public API (`TreeNodeData`, props, tokens, `renderLabel`/
`renderActionNode`, search, selection), but renders only the visible window instead
of the whole tree. Stays **dumb**: you hand it `data`, it windows. No async, no
backend (that's `<DatabaseTree>` above it). Reuses the shared core verbatim:
`flattenVisible`, `TreeRow`, `TreeContext`, `search` (prune/dim), `tokens`.

## Packaging
- Own file `src/VirtualTree.tsx` + barrel `src/virtual.tsx`.
- Subpath export `@timotholt/solid-tree/virtual` (base import never pulls the dep).
- `@tanstack/solid-virtual` as an **optional peer** (`peerDependenciesMeta`).

## Core mapping (why it's small)
The search/expand pipeline already yields the flat visible list:
```
const rows = () => flattenVisible(view().data, effectiveExpanded());  // FlatRow[]
count       = rows().length
getItemKey  = (i) => rows()[i].node.id          // persistent id, NOT index
render item = <TreeRow node={rows()[i].node} depth={rows()[i].depth} />
```
Everything else (prune/dim, force-expand overlay, highlight, selection, tokens,
multi-line) is unchanged — it all lives in the shared core and operates on `rows`.

## @tanstack/solid-virtual usage (validated pattern + gotchas)

```tsx
// 1. Create ONCE at top level. NEVER inside createMemo/function — Solid would
//    recreate it on every signal change, resetting scroll + the measurement cache.
let scrollEl!: HTMLDivElement;
const virtualizer = createVirtualizer({
  // 2. Reactive fields via GETTERS so the adapter re-reads them.
  get count() { return rows().length; },
  getScrollElement: () => scrollEl,
  // 3. Estimate the LARGER row (1–3 line rows) to minimize correction jump.
  estimateSize: () => 44,
  // 4. Key by node id — measured heights cache by key; prune rebuilds node
  //    objects each keystroke, so index/ref keys would thrash heights.
  getItemKey: (i) => rows()[i].node.id,
  overscan: 6,
});
```

```tsx
// 5. Scroll container: explicit height + overflow + contain + overflow-anchor:none.
//    overflow-anchor:none is CRITICAL — browser scroll-anchoring fights dynamic
//    measurement and causes visible jump.
<div ref={scrollEl} class="solid-tree-viewport"
     style="height:100%; overflow-y:auto; contain:strict; overflow-anchor:none">
  {/* 6. Sizer: total height; rows absolutely positioned inside. */}
  <div style={`position:relative; width:100%; height:${virtualizer.getTotalSize()}px`}>
    <For each={virtualizer.getVirtualItems()}>
      {(vi) => (
        <div
          data-index={vi.index}
          ref={virtualizer.measureElement}        // 7. ResizeObserver → variable height, free
          style={`position:absolute; top:0; left:0; width:100%; transform:translateY(${vi.start}px)`}
        >
          <TreeRow node={rows()[vi.index].node} depth={rows()[vi.index].depth} />
        </div>
      )}
    </For>
  </div>
</div>
```

```tsx
// 8. Selection reveal: map selectedId → flat index, scroll to it.
createEffect(() => {
  const id = props.selectedId;
  if (id == null) return;
  const i = rows().findIndex((r) => r.node.id === id);
  if (i >= 0) virtualizer.scrollToIndex(i, { align: "auto" });
});
```

### Gotcha checklist
- [ ] virtualizer created once at top level (not in memo) — reactive via getter-options.
- [ ] scroll container: `height` + `overflow-y:auto` + `contain:strict` + **`overflow-anchor:none`**.
- [ ] sizer `height = getTotalSize()`, rows `position:absolute` + `translateY(start)`.
- [ ] `ref={virtualizer.measureElement}` + `data-index` on each row (dynamic height).
- [ ] `getItemKey = i => rows()[i].node.id` (persistent id — measurement cache key).
- [ ] `estimateSize` tuned to the larger common row height.
- [ ] SSR guard (needs DOM; `getScrollElement` null until mounted — adapter tolerates).
- [ ] keyboard `scrollToIndex` for arrow-nav (with a11y feature).
- [ ] dividers are measured rows (small height) — no special-casing.
- [ ] wrap the whole thing in `<TreeContext.Provider value={ctx}>` exactly like `<Tree>`
      (TreeRow reads ctx). The ctx + state logic is shared with Tree → factor the
      state half of `<Tree>` (`createTreeState`) so both components reuse it.

## State sharing
`<Tree>` currently holds the expand/persist/search/selection state inline. Before
building `VirtualTree`, extract that into a headless `createTreeState(props)` →
returns `{ ctx, view, rows, effectiveExpanded, handleToggle, ... }`. Both `<Tree>`
(recursive render) and `<VirtualTree>` (windowed render) consume it. This is the
"headless core" — the keystone the DatabaseTree/Supabase tiers also build on.

## Build order
1. Spike: throwaway page wiring `createVirtualizer` against a flat array of `TreeRow`s
   — confirm the Solid adapter's reactive-options requirement + measurement behave.
2. Extract `createTreeState` from `<Tree>` (no behavior change; verify byte-identical).
3. Build `<VirtualTree>` on `createTreeState` + the virtualizer.
4. `onRangeChange` (expose first/last visible index) — the seam `<DatabaseTree>` uses
   for lazy paging. Dumb: VirtualTree just reports its window.

## Open risks
- No official Solid example → the exact getter-options vs accessor-arg shape of
  `createVirtualizer` must be confirmed in the spike (don't trust this spec's syntax
  blind).
- Dynamic measure + items resizing above the viewport → residual scroll drift even
  with `overflow-anchor:none`; budget time to tune `estimateSize` + test scroll
  anchoring with the real 1–3 line rows.
- `scrollToIndex` during active filtering (rows() shrinks) — guard the index.
