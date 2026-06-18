# @timotholt/solid-tree — agent guide

SolidJS tree-view component. This file is the complete usage contract. Read it, then use the component without guessing.

## Install
```jsonc
"@timotholt/solid-tree": "github:timotholt/solid-tree#semver:^0.12.0"
```
Consumer MUST be SolidJS + `vite-plugin-solid`. `solid-js` is a peer dep (single Solid instance). The package ships raw source under the `solid` export condition; consumers compile it. Add `optimizeDeps: { exclude: ['@timotholt/solid-tree'] }` to the consumer's `vite.config`.

## Required setup
Tree uses two CSS vars. Define them OR import the shipped theme:
```ts
import "@timotholt/solid-tree/theme.css";   // sane defaults + row hover/active + highlight
```
Or define yourself: `--text-muted` (chevron color), `--border-subtle` (divider color). No other setup.

## Minimal example
```tsx
import { createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import "@timotholt/solid-tree/theme.css";

const data: TreeNodeData[] = [
  { id: "a", label: "Group A", type: "group",
    children: [{ id: "a1", label: "Item 1", type: "item" }] },
];

function Sidebar() {
  const [sel, setSel] = createSignal<string | null>(null);
  return <Tree data={data} selectedId={sel()} storageKey="sidebar"
               onSelect={(n) => setSel(n.id)} />;
}
```

## TreeNodeData
```ts
{
  id: string;          // unique across the whole tree; identity for selection + persistence
  label: string;       // shown text (unless renderLabel overrides)
  type: string;        // YOUR kind tag; returned in onSelect; component never interprets it
  children?: TreeNodeData[];
  iconLeft?: string | JSX.Element;
  iconRight?: string | JSX.Element;
  count?: number;      // rendered as "(n)" after label
  status?: string;     // free-form; useful inside renderActionNode
  isDivider?: boolean; // renders a horizontal rule instead of a row (dropped during search)
  variant?: "default" | "action";  // "action" = centered, dimmed, no chevron/indent (for "+ Add" rows)
  payload?: any;       // arbitrary app data; component never reads it (except a custom matcher you pass)
}
```

## Tree props
```ts
data: TreeNodeData[];                 // required
onSelect: (node) => void;             // required; fires on row click
selectedId?: string | null;          // controlled selection (see rules)
onToggle?: (id, expanded) => void;    // fires on expand/collapse + once per restored-open node on mount

storageKey?: string;                  // OMIT = no persistence (in-memory). Set = persist expand state.
storagePrefix?: string;               // default "tree"; localStorage key = `${prefix}-${storageKey}`

renderLabel?: (node) => JSX.Element;  // replace label text
renderActionNode?: (node) => JSX.Element;  // right-aligned per-row slot (badges/buttons)
basePadding?: number;                 // default 12; left pad (px) at depth 0
indentStep?: number;                  // default 12; added px per depth level

searchQuery?: string;                 // active filter; empty/undefined = off
matcher?: (node, q: string) => boolean;    // default: case-insensitive substring on label
filterMode?: "prune" | "dim";         // default "prune"
noMatchesLabel?: string;              // default "No matches" (prune mode, empty result)
```
Also exported: `Chevron`, `storage`, type `TreeMatcher`, type `TreeProps`.

## Behavior rules (the non-obvious parts)
- **Selection is controlled and NOT persisted.** You own `selectedId` in a signal; Tree calls `onSelect`. On reload, selection is whatever you initialize — only expand state persists.
- **Persistence is opt-in.** No `storageKey` → in-memory only, zero localStorage writes. Give each tree a distinct `storageKey` so multiple trees don't clobber each other.
- **Only expand/collapse state is persisted** (`Record<nodeId, boolean>`), nothing else.
- **Row click semantics** (VS Code/Finder): unexpanded → select + expand; expanded & unselected → select only; expanded & selected → collapse. The chevron always just toggles.
- **Auto-expand to selection:** setting `selectedId` to a nested node expands its ancestors.
- **Collapse reselects:** collapsing a node whose descendant is selected moves selection to that node (fires `onSelect`), so selection never hides inside a collapsed branch.
- **`type` is opaque** to the component — it's your routing tag, echoed back in `onSelect`.
- **`renderActionNode` clicks don't select the row** (slot stops propagation). Return `null`/falsy to skip a row's slot.

## Search / filter
Set `searchQuery`. Tree owns the structure; you own the match policy.
```tsx
const [q, setQ] = createSignal("");
<input value={q()} onInput={(e) => setQ(e.currentTarget.value)} />   // input + debounce are YOUR job
<Tree data={data} searchQuery={q()} ... />
```
- **`matcher` is the comparator seam.** Default tests `label`. Override to fuzzy/multi-field/read `payload` (which Tree otherwise never inspects):
  ```tsx
  matcher={(n, q) => n.label.toLowerCase().includes(q.toLowerCase())
                  || n.payload?.code?.toLowerCase().includes(q.toLowerCase())}
  ```
- **`filterMode`**: `"prune"` drops non-matches but KEEPS matches + their ancestor path; `"dim"` keeps the whole tree and fades non-matches.
- **Force-expand is an overlay** while a query is active — it reveals matches but NEVER writes saved expand state. Clearing the query restores the tree exactly as the user left it.
- **Highlight** (`<mark class="solid-tree-mark">`) is automatic ONLY on the default-matcher path. With a custom `matcher` or a `renderLabel`, you do highlighting yourself.
- **Caveat:** search only sees nodes present in `data` — it cannot match unloaded/lazy children.

## Theming
Every opinionated value is a `--tree-*` CSS var with an inline fallback (so it works with no stylesheet). Override by setting tokens on `.solid-tree-container` or ANY ancestor — they inherit, no specificity fight:
```css
.my-sidebar { --tree-font-size: 14px; --tree-indent-step: 20px; --tree-row-active-bg: #2563eb; }
```
`--tree-font-size` is a master scale knob: spatial metrics (indent/gaps/chevron/spacer) are em-relative to it, so one override resizes the whole tree (divider hairline+margin stay px).

Tokens: `--tree-font-size` `--tree-indent-base` `--tree-indent-step` `--tree-row-pad-x/y` `--tree-row-radius` `--tree-row-color` `--tree-row-hover-bg` `--tree-row-active-bg` `--tree-group-weight` `--tree-count-opacity` `--tree-count-gap` `--tree-icon-left-gap` `--tree-icon-right-gap` `--tree-icon-right-size` `--tree-chevron-size` `--tree-chevron-color`(→`--text-muted`) `--tree-chevron-gap` `--tree-action-gap` `--tree-action-opacity` `--tree-dim-opacity` `--tree-divider-color`(→`--border-subtle`) `--tree-divider-margin` `--tree-mark-bg` `--tree-mark-color` `--tree-user-select`(default `none`; set `text`/`auto` to allow text highlighting on rows).

`basePadding`/`indentStep` props, when passed, pin `--tree-indent-base/step` for that instance; omit them to theme via tokens.

State for CSS targeting (no stylesheet needed) — rows emit `data-depth`, `data-variant` (`default|action`), `data-selected`, `data-has-children`, `data-dimmed`; container emits `data-searching`:
```css
.solid-tree-row[data-selected] { font-weight: 600; }
```
Structural class hooks: `.solid-tree-container/-row/-row-content/-label/-count/-icon-left/-icon-right/-chevron/-spacer/-action/-divider/-mark/-empty`.

## Reactivity & updates (editing nodes elsewhere, e.g. a detail pane)
Tree never snapshots node content — it reads `node.label`/`count`/`iconRight`/etc. directly. Whether an edit shows up depends on HOW you update `data`. `<For>` is keyed by object REFERENCE (`===`), not id.
- **Mutate a plain object in place** (no new ref / no signal write) → STALE, nothing updates. Don't.
- **Immutable replace** (rebuild array + swap the changed node for a NEW object, then `setData(...)`) → that row remounts with new content. Works.
- **`createStore` + set a field** → fine-grained, just that text updates, no remount. Best.

Expand state and selection are keyed by `id` (Tree's own signal + your `selectedId`), NOT by reference. So title/badge/count edits preserve expand + selection AS LONG AS `id` is stable. Changing a node's `id` drops its expand/selected state.

Gotchas: (1) while a `searchQuery` is active, rendered nodes are `{...node}` COPIES (prune step) — with a store the search memo still re-runs on field changes; with a plain signal you must replace the array. (2) Do NOT share the exact same object between a `createStore` and a live `<For>` element — shared ref corrupts reconciliation; feed the tree a derived/cloned view and mutate through the store.

Recommendation: drive tree + detail pane from one store; pass the tree a DERIVED (cloned, not shared) `data`; update via store setters (or immutable array replace) with stable ids. No package change needed — this is a consumer data-flow contract.

## Multi-line rows
Rows grow with content (no fixed height). For 2/3/N-line items: set `--tree-label-white-space: normal` + `--tree-row-align-items: flex-start` on the container, then return a stacked block from `renderLabel` (e.g. stem + meta + status). Selection/chevron/indent/action-slot all work on taller rows.

## Virtualization (future)
`<Tree>` is recursive, grows with content, no deps — fine up to a few thousand nodes. For 10k+ a separate `<VirtualTree>` is planned (see `docs/SPEC-virtualization.md`): same `TreeNodeData`/props/tokens, adds windowing via `@tanstack/solid-virtual` + a bounded-height container + `measureElement` + `scrollToIndex`. The seam is shipped: `flattenVisible(data, expanded) → FlatRow[]` (exported; dividers marked `navigable:false`). Not built yet — don't import `VirtualTree`.

## `<VirtualTree>` — windowed, for large lists
Same API + tokens as `<Tree>`, but renders only the visible window via
`@tanstack/solid-virtual`. Use for big in-memory lists (thousands+). Import from the
subpath; it has extra requirements:
```tsx
import { VirtualTree } from "@timotholt/solid-tree/virtual";
// REQUIRES a bounded-height parent (or pass viewportStyle). It fills 100% height.
<div style="height:420px">
  <VirtualTree data={data} selectedId={sel()} searchQuery={q()} onSelect={...} />
</div>
```
- Extra props: `estimateSize?` (px, default 32 — tune to common row), `overscan?`
  (default 6), `class?`/`viewportStyle?` (the scroll viewport), `onRangeChange?(start,end)`
  (the lazy-paging seam for the future `<DatabaseTree>`).
- Peer dep `@tanstack/solid-virtual` (optional — only `/virtual` needs it).
- **Consumer MUST dedupe solid-js** in their bundler, or a prod build can pull a
  second solid-js instance and `ref`/`use()` directives silently no-op (blank list).
  Vite: `resolve: { dedupe: ['solid-js', '@tanstack/solid-virtual'] }`. Also
  `optimizeDeps: { exclude: ['@timotholt/solid-tree'] }`.

## `<DatabaseTree>` — async, source-backed
Same API, but takes a `source` instead of in-memory `data`. Async roots + lazy
children-on-expand, cached via TanStack Query, rendered windowed via VirtualTree.
```tsx
import { DatabaseTree } from "@timotholt/solid-tree/database";
import type { TreeSource } from "@timotholt/solid-tree/database";

const source: TreeSource = {
  getRoots: () => supabase.from("nodes").select().is("parent_id", null).then(r => r.data.map(toNode)),
  getChildren: (node) => supabase.from("nodes").select().eq("parent_id", node.id).then(r => r.data.map(toNode)),
  // search?(query) → flat matches (ancestor hydration is a future step)
};
<div style="height:420px"><DatabaseTree source={source} selectedId={sel()} onSelect={...} /></div>
```
- `TreeSource`: `getRoots()` required; `getChildren?(node)` for lazy expand; `search?(query)` optional. Mark leaf nodes with `payload.leaf === true` so they don't show an expander.
- Peers (both optional): `@tanstack/solid-query` + `@tanstack/solid-virtual`.
- Makes its own QueryClient, or pass `queryClient` to reuse the app's.
- Same dedupe + viewport-height + bounded-parent rules as VirtualTree.
- Loading-on-expand shows a transient "Loading…" placeholder row.
- v1 search is client-side over loaded nodes; server `source.search` + ancestor
  hydration + scroll-paging (via VirtualTree `onRangeChange`) are documented next steps.

### Live updates (collaborative / realtime)
`TreeSource.subscribe?(onChange)` makes DatabaseTree patch its cache from live
events — so collaborators' edits show up without refetch. Return an unsubscribe fn.
```ts
type TreeChange =
  | { type: "update"; node: TreeNodeData }              // fields changed
  | { type: "insert"; parentId: string | null; node }   // null parent = new root
  | { type: "remove"; id: string };
subscribe(onChange) {                                    // e.g. a Supabase channel
  const ch = supabase.channel("nodes").on("postgres_changes", {...}, (p) => onChange(toChange(p))).subscribe();
  return () => supabase.removeChannel(ch);
}
```
Only ALREADY-LOADED branches are patched; unloaded ones load fresh on expand.
**Record locking** rides on this: put `lockedBy` on `payload`; selecting a row
(your `onSelect`) acquires the lock server-side (atomic), the change broadcasts via
`subscribe`, and your `renderActionNode` shows 🔒/👤. The tree just reflects — lock
acquire/release/TTL + RLS enforcement live in your app + Supabase. (See the
`?database2` example.)

## `<SupabaseTree>` — Supabase preset + record locking
Thin preset over DatabaseTree: maps a Supabase table to a source (auto-paginates past
the PostgREST 1000-row cap), wires realtime, and adds collaborative locking.
```tsx
import { SupabaseTree } from "@timotholt/solid-tree/supabase";
<SupabaseTree client={supabase} table="nodes" toNode={toNode}
  parentColumn="parent_id" orderBy={{ column: "label" }}
  onSelect={...} renderActionNode={(n) => n.payload.lockedBy ? "🔒" : null} />
```
- Peer (optional): `@supabase/supabase-js`. **Dedupe it too** alongside solid-js.
- Server side (RLS + SECURITY DEFINER acquire/release/touch RPCs + the adversarial
  test harness) lives in `supabase/` — see `docs/SPEC-locking.md`. The component only
  reflects + triggers; Postgres enforces.

## Controller API (imperative) — every tier
Each tier ships a **controller** beside its component. The component is the declarative
view; the controller is the instance that OWNS the state, so you can drive the tree from
outside (buttons, shortcuts, your own logic). Two equivalent ways to use any tier:
```tsx
// A) props (component builds its own controller — the original API, unchanged)
<Tree data={data} selectedId={sel()} onSelect={...} />
// B) controller (you build it, drive it, pass it in)
const tree = createTreeController({ data: () => data });   // ⚠️ call inside a component / createRoot
<VirtualTree tree={tree} />
tree.expandAll(); tree.select("apple"); tree.setSearch("foo");
```
- `createTreeController` (base + `/virtual`): reads `nodes/displayNodes/flatRows/
  expandedIds/selectedId/searching/noMatches`; actions `expand/collapse/toggle/expandAll/
  collapseAll/select/deselect/setSearch`. Opts: `data` (Accessor, required) + optional
  controlled `selectedId`/`searchQuery` accessors, `matcher`, `filterMode`, `onSelect`,
  `onToggle`, `storageKey`, `storagePrefix`.
- `createDatabaseTreeController` (`/database`): + `loadChildren/reloadChildren/isLoading/
  subscribe/unsubscribe`; opts take `source` (+ `queryClient`) instead of `data`.
- `createSupabaseTreeController` (`/supabase`): + `heldId/acquireLock/releaseLock/
  releaseAllLocks/refreshLock`; opts take `client/table/toNode/parentColumn/…`.
- ⚠️ Controllers create signals/effects → build them in a component body or `createRoot`,
  never at module top. `selectedId`/`searchQuery` are SINGLE-selection, controlled-input
  accessors that win over the internal signal when provided.

## What it does NOT do (don't assume these)
- No multi-select, no checkboxes. Single selection only (all tiers, incl. controllers).
- No drag-and-drop, no inline rename, no context menu.
- Base `<Tree>` does no data fetching or virtualization — build `data` yourself (use
  `<VirtualTree>` for large lists, `<DatabaseTree>`/`<SupabaseTree>` for async/lazy).
- Does not persist selection, scroll, or filter — only expand state, and only if `storageKey` is set.

## Common patterns
Badges + delete button:
```tsx
renderActionNode={(n) => (
  <>
    {n.status === "new" && <span class="badge">new</span>}
    <button onClick={() => remove(n.id)}>✕</button>
  </>
)}
```
Two independent trees in one app: give each its own `storageKey` (`"nav"`, `"files"`) — they won't share state.

## Reference
Live examples gallery (every feature + source): `examples/` → `npm run dev` (`:5180`). Full prose: `README.md`.
