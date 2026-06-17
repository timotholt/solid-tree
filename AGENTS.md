# @timotholt/tree — agent guide

SolidJS tree-view component. This file is the complete usage contract. Read it, then use the component without guessing.

## Install
```jsonc
"@timotholt/tree": "github:timotholt/solid-tree#v0.2.0"
```
Consumer MUST be SolidJS + `vite-plugin-solid`. `solid-js` is a peer dep (single Solid instance). The package ships raw source under the `solid` export condition; consumers compile it. Add `optimizeDeps: { exclude: ['@timotholt/tree'] }` to the consumer's `vite.config`.

## Required setup
Tree uses two CSS vars. Define them OR import the shipped theme:
```ts
import "@timotholt/tree/theme.css";   // sane defaults + row hover/active + highlight
```
Or define yourself: `--text-muted` (chevron color), `--border-subtle` (divider color). No other setup.

## Minimal example
```tsx
import { createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/tree";
import "@timotholt/tree/theme.css";

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

## What it does NOT do (don't assume these)
- No multi-select, no checkboxes. Single selection only.
- No drag-and-drop, no inline rename, no context menu.
- No data fetching. You build `data`; for lazy children, fetch in the parent and feed updated `data` (optionally trigger via `onToggle`).
- No virtualization (fine up to a few thousand nodes; not for 10k+).
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
