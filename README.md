# @timotholt/solid-tree

A small, themeable **SolidJS** tree-view component. Extracted to be reused across
apps — "build once, use many".

Features: expand/collapse (optionally persisted to `localStorage`), selection with
auto-expand-to-selection, left/right icons, counts, dividers, depth indentation,
per-node action slots, custom label rendering, and search/filter (prune or dim,
pluggable matcher, built-in highlight). Every component tier implements the same
WAI-ARIA tree semantics, roving focus, and standard keyboard navigation.

`solid-js` is a **peer dependency** — the package ships its raw source under the
`solid` export condition so your app's `vite-plugin-solid` compiles it, keeping a
single Solid instance.

### Tiers (import only what you need)
| import | component / controller | for | extra peer |
| --- | --- | --- | --- |
| `@timotholt/solid-tree` | `<Tree>` / `createTreeController` | recursive, in-memory, grows with content | none |
| `@timotholt/solid-tree/virtual` | `<VirtualTree>` / `createTreeController` | windowed, large in-memory lists | `@tanstack/solid-virtual` |
| `@timotholt/solid-tree/database` | `<DatabaseTree>` / `createDatabaseTreeController` | async source, lazy-load, cached, realtime | `+ @tanstack/solid-query` |
| `@timotholt/solid-tree/supabase` | `<SupabaseTree>` / `createSupabaseTreeController` | Supabase table + record locking | `+ @supabase/supabase-js` |

Same `TreeNodeData`/props/tokens across all tiers. The base import pulls zero extra
deps. Each tier ships both a **component** (declarative) and a **controller** (imperative)
— see [Controller API](#controller-api-imperative). **Consumers must `resolve.dedupe`
solid-js** (+ any tier peers) — see AGENTS.md.

## Install

### 0. Requirements (who this is for)

A **SolidJS** app built with **Vite + `vite-plugin-solid`** (the standard Solid setup).
The package ships its raw `.tsx` source under the `"solid"` export condition, so *your*
`vite-plugin-solid` compiles it — that's what keeps a single Solid instance. `solid-js` is
a **peer dependency** (you already have it in a Solid app), `solid-js` ≥ 1.9.16.

> Not using Vite/`vite-plugin-solid`? There's a compiled `import` entry + types
> (`dist/*.js`) for other bundlers, and a server build under the `node` condition
> (`dist/server/*.js`) so the package imports in Node and can render to HTML (without
> hydration). The Vite path above is the supported one.

### 1. Add the dependency (where + when)

No registry — install from the git repo. **Pin a `#semver:` range** so `npm update` pulls
the newest matching tag (don't get stuck on an old version):

```jsonc
// package.json
{
  "dependencies": {
    "@timotholt/solid-tree": "github:timotholt/solid-tree#semver:^0.16.0"
  }
}
```

`#semver:^0.16.0` → highest `0.16.x` tag (0.x minors may break; see CHANGELOG.md). For a
fully reproducible install, pin an exact tag instead: `#v0.16.0`. Then run `npm install`.
Git installs build `dist/` on install via the `prepare` script.

### 2. Install the peer deps for the tiers you use (what)

The base import has **zero** extra deps. Each higher tier needs one optional peer — install
only the ones you import (see the [tiers table](#tiers-import-only-what-you-need)):

```bash
# base <Tree> — nothing extra
npm i @tanstack/solid-virtual     # for /virtual  → <VirtualTree>   (≥ 3.13.32)
npm i @tanstack/solid-query       # for /database → <DatabaseTree>  (≥ 5.30.0; also needs solid-virtual)
npm i @supabase/supabase-js       # for /supabase → <SupabaseTree>  (≥ 2.45.0; also needs the two above)
```

### 3. Configure Vite — REQUIRED (how) ⚠️

**This step is mandatory, and skipping it fails *silently*.** Without it a production build
can pull a **second copy of `solid-js`**; then `ref`/`use()` directives from the wrong
instance no-op and you get a **blank, dead tree with no error**. Add to `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  // Collapse to ONE instance of solid-js (+ any tier peers you installed in step 2).
  resolve: { dedupe: ["solid-js", "@tanstack/solid-virtual", "@tanstack/solid-query"] },
  // Let vite-plugin-solid compile the package's raw .tsx (don't pre-bundle it).
  optimizeDeps: { exclude: ["@timotholt/solid-tree"] },
});
```

List only the peers you actually use. If the tree renders blank (esp. only in `vite build`,
not `vite dev`), this is almost always a missing/incomplete `dedupe`.

### 4. Import + theme

```ts
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import "@timotholt/solid-tree/theme.css"; // or define the CSS vars yourself (see Theme below)
```

### Updating

Bump the consumer's `#semver:` range (or run `npm update @timotholt/solid-tree`). Per-tag
notes are on the [GitHub releases](https://github.com/timotholt/solid-tree/releases).

> **Publishing to npm later:** `npm publish` works as-is — the `exports` map already exposes
> the compiled `import` entry + `.d.ts` for non-Solid-aware bundlers.

## Theme (required CSS vars)

The component references two CSS custom properties. Either define them yourself:

```css
:root {
  --text-muted: #8a8f98;        /* chevron color */
  --border-subtle: rgba(0,0,0,0.12); /* divider color */
}
```

…or import the shipped defaults (also styles row hover/active + the action slot):

```ts
import "@timotholt/solid-tree/theme.css";
```

`theme.css` exposes overridable vars: `--tree-row-hover-bg`, `--tree-row-active-bg`,
`--tree-row-radius`, `--tree-row-color`.

## Usage

```tsx
import { createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import "@timotholt/solid-tree/theme.css";

const data: TreeNodeData[] = [
  {
    id: "fruit", label: "Fruit", type: "group", iconLeft: "🍎",
    children: [
      { id: "apple", label: "Apple", type: "item", count: 3 },
      { id: "banana", label: "Banana", type: "item", iconRight: "⭐", status: "new" },
    ],
  },
  { id: "div", label: "", type: "divider", isDivider: true },
  { id: "add", label: "+ Add", type: "add", variant: "action" }, // centered, dimmed, no chevron
];

function Sidebar() {
  const [sel, setSel] = createSignal<string | null>("apple");
  return (
    <Tree
      data={data}
      selectedId={sel()}
      ariaLabel="Sidebar navigation"
      storageKey="sidebar"
      rowClickPolicy="select-only" // useful in editors; default is "finder"
      onSelect={(n) => setSel(n.id)}
      renderActionNode={(n) =>
        n.status === "new" ? <span class="badge">new</span> : null
      }
    />
  );
}
```

### Badges / actions via `renderActionNode`

`renderActionNode(node)` renders into a right-aligned slot on each row. Clicks
inside it don't trigger row selection (the slot stops propagation). Return
`null` for rows that shouldn't show one:

```tsx
renderActionNode={(node) => (
  <>
    {node.count != null && <span class="badge">{node.count}</span>}
    <button onClick={() => remove(node.id)}>✕</button>
  </>
)}
```

## Controller API (imperative)

Every tier ships a **controller** alongside its component. The component is the
declarative view; the controller is the imperative instance that owns the state — so you
can drive the tree from *outside* (toolbar buttons, keyboard shortcuts, your own logic).
Same pattern as TanStack's "instance + markup".

```tsx
import { createTreeController, VirtualTree } from "@timotholt/solid-tree/virtual";

function Sidebar() {
  const tree = createTreeController({ data: () => myData });   // build inside a component!
  return (
    <>
      <button onClick={() => tree.expandAll()}>Expand all</button>
      <button onClick={() => tree.select("apple")}>Select Apple</button>
      <input onInput={(e) => tree.setSearch(e.currentTarget.value)} />
      <VirtualTree tree={tree} />          {/* the view just reflects the controller */}
    </>
  );
}
```

Or skip the controller and pass props — the component builds one internally (the original
API, unchanged): `<Tree data={data} selectedId={sel()} onSelect={...} />`.

> ⚠️ `create*Controller()` creates signals/effects, so call it **inside a component body
> or `createRoot`** — never at module top level.

**`createTreeController(opts)` → `TreeController`** (also in `/virtual`):

| reads (accessors) | actions |
| --- | --- |
| `nodes()` · `displayNodes()` · `flatRows()` | `expand(id)` · `collapse(id)` · `toggle(id)` |
| `expandedIds()` · `selectedId()` | `expandAll()` · `collapseAll()` |
| `searching()` · `noMatches()` | `select(id)` · `deselect()` · `setSearch(q)` |

Options: `data` (required, `Accessor<TreeNodeData[]>`), and optional `selectedId` /
`searchQuery` (controlled-input accessors that win over the internal signals), `matcher`,
`filterMode`, `onSelect`, `onToggle`, `storageKey`, `storagePrefix`.

**`createDatabaseTreeController(opts)`** adds: `loadChildren(id)` · `reloadChildren(id)` ·
`isLoading(id)` · `subscribe()` · `unsubscribe()`. Options take a `source` (+ optional
`queryClient`) instead of `data`.

**`createSupabaseTreeController(opts)`** adds: `heldId()` · `acquireLock(id)` ·
`releaseLock()` · `releaseAllLocks()` · `refreshLock()`. Options take `client` / `table` /
`toNode` (+ `parentColumn`, `orderBy`, lock RPC overrides, …). See
[docs/SPEC-locking.md](docs/SPEC-locking.md) for the server side.

## API

### `TreeNodeData`

| field          | type                          | notes                                                      |
| -------------- | ----------------------------- | ---------------------------------------------------------- |
| `id`           | `string`                      | unique; used for selection + persisted expand state        |
| `label`        | `string`                      | shown unless `renderLabel` overrides                       |
| `type`         | `string`                      | app-defined kind, handed back in `onSelect`; not interpreted |
| `iconLeft?`    | `string \| JSX.Element`       | leading icon                                               |
| `iconRight?`   | `string \| JSX.Element`       | trailing icon                                              |
| `count?`       | `number`                      | shown as `(n)` after the label                             |
| `status?`      | `string`                      | free-form; useful inside `renderActionNode`                |
| `isDivider?`   | `boolean`                     | renders a horizontal rule instead of a row                 |
| `variant?`     | `"default" \| "action"`       | `"action"` = centered, dimmed, no chevron/indent           |
| `children?`    | `TreeNodeData[]`              | nested nodes                                               |
| `payload?`     | `any`                         | arbitrary data carried on the node                         |

### `<Tree>` props

| prop               | type                                  | default  | notes                                            |
| ------------------ | ------------------------------------- | -------- | ------------------------------------------------ |
| `data`             | `TreeNodeData[]`                      | —        | tree to render                                   |
| `selectedId?`      | `string \| null`                      | —        | selected node id; ancestors auto-expand          |
| `ariaLabel?`       | `string`                              | —        | accessible name for the tree root (all tiers)      |
| `ariaLabelledBy?`  | `string`                              | —        | id of an element that labels the tree root (all tiers) |
| `storageKey?`      | `string`                              | —        | **opt-in** persistence. Set a per-tree key to remember expand state across reloads; omit for in-memory only (multiple unkeyed trees won't clobber) |
| `storagePrefix?`   | `string`                              | `"tree"` | `localStorage` key = `${storagePrefix}-${storageKey}` |
| `onSelect`         | `(node) => void`                      | —        | row selected                                     |
| `onToggle?`        | `(id, expanded) => void`              | —        | expand/collapse fired (incl. restored on mount)  |
| `rowClickPolicy?`  | `"finder" \| "select-only"`          | `"finder"` | Finder preserves the original row select/toggle behavior; select-only reserves expansion for the chevron/keyboard |
| `renderActionNode?`| `(node) => JSX.Element`               | —        | right-side slot per row                           |
| `renderLabel?`     | `(node) => JSX.Element`               | —        | custom label renderer                            |
| `basePadding?`     | `number`                              | `12`     | left padding (px) at depth 0                     |
| `indentStep?`      | `number`                              | `12`     | added px per depth level                         |
| `searchQuery?`     | `string`                              | —        | active filter; empty/undefined = no filtering    |
| `matcher?`         | `(node, q: string) => boolean`        | label substring | hit policy (see Search below)             |
| `filterMode?`      | `"prune" \| "dim"`                    | `"prune"`| prune drops non-matches; dim fades them           |
| `noMatchesLabel?`  | `string`                              | `"No matches"` | shown (prune) when a query yields nothing   |
| `tree?`            | `TreeController`                       | —        | drive the view with an external controller (then `data`/`onSelect`/`selectedId`/… are owned by it) — see [Controller API](#controller-api-imperative) |

Also exported: `Chevron` (the ▶/▼ toggle), `storage` (the localStorage helper), `createTreeController`, and the `TreeMatcher`/`TreeRowClickPolicy`/`TreeController` types.

## Selection, row clicks, and keyboard

`rowClickPolicy="finder"` is the backward-compatible default: clicking a closed
parent selects and expands it; clicking an open unselected parent selects it
without collapsing; clicking that selected parent again collapses it. The
chevron always only toggles expansion.

Use `rowClickPolicy="select-only"` for editors where selecting an object must not
also change the visible structure. Row clicks then only select; the chevron and
Left/Right keys own expansion.

`<Tree>`, `<VirtualTree>`, `<DatabaseTree>`, and `<SupabaseTree>` emit
`role="tree"`, `role="treeitem"`, `aria-level`,
`aria-selected`, and `aria-expanded` where applicable. Give the tree an
accessible name with `ariaLabel` or `ariaLabelledBy`. Visual divider rows are
hidden from the accessibility tree. Focus is roving: Tab returns to the last
focused visible row, falling back to the selected row and then the first visible
row, then:

- Up/Down move through visible rows and skip dividers.
- Right expands a closed parent, then moves to its first child when already open.
- Left collapses an open parent, then moves to its parent when already closed.
- Home/End move to the first/last visible row.
- Enter/Space select the focused row.

The virtualized tiers use the same navigation resolver. When a target row is
outside the mounted window, they scroll its full visible-row index into view and
focus it after the virtualizer renders it. DatabaseTree and SupabaseTree inherit
that behavior through VirtualTree.

Interactive content returned by `renderActionNode` keeps its own click and
keyboard events; the row is a focusable `div[role=treeitem]`, not a wrapping
button, so nested action buttons remain valid HTML.

## Search & filtering

Set `searchQuery`. Tree owns the **structure** (keeps matches + their ancestor
path, force-expands to reveal them *without* touching saved expand state, restores
on clear); you own the **policy** via `matcher`.

```tsx
const [q, setQ] = createSignal("");
<input value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
<Tree data={data} searchQuery={q()} ... />   // default: case-insensitive label substring
```

- **`matcher`** is the comparator seam — default tests `label`. Override to fuzzy
  match, span fields, or read `payload` (which Tree never inspects itself):
  ```tsx
  matcher={(n, q) =>
    n.label.toLowerCase().includes(q.toLowerCase()) ||
    n.payload?.code?.toLowerCase().includes(q.toLowerCase())
  }
  ```
- **`filterMode`** — `"prune"` (default) removes non-matches; `"dim"` keeps the
  whole tree and lowers opacity on non-matches.
- **Highlight** — the matched substring is wrapped in `<mark class="solid-tree-mark">`
  automatically on the default-matcher path. With a custom `matcher` (returns a
  bool, so Tree can't know *what* matched) or a `renderLabel`, you own highlighting.
- Debounce and the `<input>` itself stay in your component.
- **Note:** prune-search assumes the subtree is loaded — it can't match nodes you
  haven't supplied (e.g. lazy/async children).

## Reactivity & live updates

Editing a node elsewhere (a detail pane changes a title, removes a badge…) does
**not** break the tree — but whether the change *appears* depends on how you
update `data`. Tree reads `node.label`/`count`/`iconRight`/etc. directly and never
snapshots them; `<For>` is keyed by object **reference** (`===`), not id.

| update style | result |
| ------------ | ------ |
| mutate a plain object in place (no new ref / signal write) | **stale — nothing updates.** Don't. |
| immutable replace (new array + new node object, then `setData`) | that row remounts with new content ✓ |
| `createStore` + `setStore(path, field, val)` | fine-grained; just that text updates, no remount ✓✓ |

**Collapsing a branch that hides the selection moves selection to that branch** —
e.g. with a child selected, collapsing its parent (chevron or row) reselects the
parent so the selection never disappears into a collapsed node. (`onSelect` fires
with the parent.)

**Expand state and selection are keyed by `id`** (Tree's own signal + your
`selectedId`), not by reference — so title/badge/count edits keep expand +
selection intact **as long as `id` is stable**. Changing a node's `id` drops its
expand/selected state.

Two gotchas:
- While a `searchQuery` is active, rendered nodes are `{...node}` **copies** (the
  prune step). With a store the search memo still recomputes on field changes;
  with a plain signal you must replace the array to retrigger.
- Don't share the **exact same object** between a `createStore` and a live `<For>`
  element — a shared reference corrupts reconciliation. Feed the tree a
  derived/cloned view and mutate through the store.

**Recommendation:** drive the tree and the detail pane from one store; pass the
tree a **derived (cloned, not shared)** `data`; update via store setters (or
immutable array replace) with **stable ids**. Nothing to change in the package —
this is a consumer-side data-flow contract.

## Theming

Every opinionated value is a `--tree-*` CSS custom property with its default baked
in as an inline fallback — so the component looks right with **no stylesheet**, and
you override any value **without a specificity fight**. Set tokens on
`.solid-tree-container` or any ancestor (custom properties inherit):

> **`--tree-font-size` is a master scale knob.** Spatial metrics (indent, gaps,
> chevron, spacer) are `em`-relative to it, so one override resizes the whole tree
> proportionally — e.g. `--tree-font-size: 14px` scales everything. (The divider
> hairline + margin stay px on purpose.)

```css
.my-sidebar {
  --tree-font-size: 14px;
  --tree-indent-step: 20px;
  --tree-group-weight: 600;
  --tree-row-active-bg: #2563eb;
  --tree-chevron-color: #60a5fa;
}
```

Tokens: `--tree-font-size` · `--tree-indent-base` · `--tree-indent-step` ·
`--tree-row-pad-x/y` · `--tree-row-radius` · `--tree-row-color` ·
`--tree-row-hover-bg` · `--tree-row-active-bg` · `--tree-group-weight` ·
`--tree-count-opacity` · `--tree-count-gap` · `--tree-icon-left-gap` ·
`--tree-icon-right-gap` · `--tree-icon-right-size` · `--tree-chevron-size` ·
`--tree-chevron-color` (→ `--text-muted`) · `--tree-chevron-gap` ·
`--tree-action-gap` · `--tree-action-opacity` · `--tree-dim-opacity` ·
`--tree-divider-color` (→ `--border-subtle`) · `--tree-divider-margin` ·
`--tree-mark-bg` · `--tree-mark-color` · `--tree-user-select` (default `none` —
rows don't highlight text on click; set `text`/`auto` to re-enable) ·
`--tree-label-white-space` (default `nowrap`) · `--tree-row-align-items`
(default `center`).

### Multi-line rows

Rows aren't fixed-height — they grow with content. For 2/3/N-line items, set
`--tree-label-white-space: normal` + `--tree-row-align-items: flex-start` on the
container, then return a stacked block from `renderLabel`:

```css
.list { --tree-label-white-space: normal; --tree-row-align-items: flex-start; }
```
```tsx
renderLabel={(n) => (
  <div style="display:flex;flex-direction:column">
    <span>{n.payload.stem}</span>
    <span>{n.payload.meta}</span>
    <span>{n.payload.status}</span>
  </div>
)}
```
Selection, chevron, indent, and the action slot all still work on the taller rows.

> `basePadding`/`indentStep` props still work — when passed they pin
> `--tree-indent-base/step` for that instance; omit them to theme via the tokens.

> **Contributor note:** the component markup contains no style literals. Every
> default lives once in `STYLE_DEFAULTS` (`src/Tree.tsx`) / `CHEVRON_DEFAULTS`
> (`src/Chevron.tsx`), published as `--tree-*-default`; styles read
> `var(--tree-<name>, var(--tree-<name>-default))`. Change a default in one place.

**State via data-attributes** — every row carries `data-depth`, `data-variant`
(`default`|`action`), `data-selected`, `data-has-children`, `data-dimmed`; the
container carries `data-searching`. Target them with plain CSS (no theme.css):

```css
.solid-tree-row[data-selected] { font-weight: 600; }
.solid-tree-row[data-depth="0"] { text-transform: uppercase; }
.solid-tree-container[data-searching] .solid-tree-row { transition: opacity .1s; }
```

Class hooks for structure: `.solid-tree-container`, `.solid-tree-row`,
`.solid-tree-row-content`, `.solid-tree-label`, `.solid-tree-count`,
`.solid-tree-icon-left`, `.solid-tree-icon-right`, `.solid-tree-chevron`,
`.solid-tree-spacer`, `.solid-tree-action`, `.solid-tree-divider`,
`.solid-tree-mark`, `.solid-tree-empty`.

## Cutting a new version

```bash
# bump "version" in package.json, then:
npm run build          # sanity check: dist + types emit clean
git commit -am "release: vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

Consumers bump the `#vX.Y.Z` ref in their `package.json` and re-`npm install`.

## Develop

```bash
npm install
npm run build          # vite lib build + tsc .d.ts
cd examples && npm install && npm run dev   # live demo gallery on :5180
```

## License

MIT
