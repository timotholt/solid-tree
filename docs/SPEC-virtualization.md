# Spec — virtualization seam & `<VirtualTree>`

Status: **prep refactor = this PR (v0.6.0)**. `<VirtualTree>` = future, built when a
list actually outgrows ~a few thousand nodes (e.g. users-as-tree at scale).

## Recommendations (the 10k-ft decisions)

1. **Two components, one API.** Keep `<Tree>` lean (recursive, grows with content,
   zero deps). Ship `<VirtualTree>` as a **separate export** with the baggage.
   Same `TreeNodeData`, props, tokens, `renderLabel`/`renderActionNode` → a
   consumer swaps `Tree` → `VirtualTree` with ~one import change when scale demands.

2. **Don't bolt `virtual` onto `<Tree>` as a flag.** The virtual path *requires* a
   bounded-height scroll container; the recursive one doesn't. One component with
   two contracts bloats it. Separate export keeps each honest.

3. **Assume variable row height from day one.** Rows are 1-line (lists) up to N-line
   (user cards, question stems). So `<VirtualTree>` uses dynamic measurement, never
   fixed height. Multi-line is enabled in `<Tree>` today via two tokens (below).

4. **Build the seam now, defer the dep.** Extract the shared pieces so `VirtualTree`
   is a clean add later with no rework of `Tree`. `@tanstack/solid-virtual` only
   enters as an **optional peer** when `VirtualTree` ships.

## Tree vs VirtualTree

| | `<Tree>` (lean) | `<VirtualTree>` (baggage) |
|---|---|---|
| render | recursive `<For>` | flatten → windowed slice |
| height | grows with content | **requires bounded-height container** |
| dep | none | `@tanstack/solid-virtual` (optional peer) |
| measurement | — | `measureElement` + id-keyed height cache + estimate tuning |
| selection | already in DOM | `scrollToIndex(selectedId)` |
| a11y | roles/keyboard (future) | + `aria-setsize/posinset` for windowing |
| extra props | — | `height` (or container), `estimateSize?`, `overscan?` |

**Shared (extracted, both consume):** `TreeNodeData`/types · `STYLE_DEFAULTS`/`tok`
· search (`pruneNode`/matcher) · the pure single-row renderer (`TreeRow`) ·
`TreeContext` · `flattenVisible(data, expanded)` · expand/persistence logic. The
ONLY things `VirtualTree` adds are the baggage-column items.

## Prep refactor (this PR — v0.6.0, no dep, no behavior change)

1. **`TreeRow`** — single row interior (chevron/spacer/icons/label/count/action, or
   the divider rule). Pure, context-driven, takes `{ node, depth }`, **no child
   recursion**. Reusable by the recursive `<Tree>` AND the flat `<VirtualTree>`.
2. **`TreeBranch`** — recursive wrapper = `TreeRow` + `<Show expanded><For children>`.
   `<Tree>` renders these. (Stays recursive → fine-grained, stable identity; no perf
   regression. `<Tree>` intentionally does NOT flatten — flattening + by-id keying is
   a virtualizer concern.)
3. **`flattenVisible(nodes, expanded) → FlatRow[]`** exported helper.
   `FlatRow = { node, depth, hasChildren, navigable }`. Honors `expanded` (descends
   only expanded nodes). Dividers included with `navigable: false`. This is what
   `VirtualTree` will feed the virtualizer; shipped + tested now.
4. **Multi-line tokens** (defaults preserve single-line rendering exactly):
   - `--tree-label-white-space` (default `nowrap`) → set `normal` to wrap.
   - `--tree-row-align-items` (default `center`) → set `flex-start` so
     chevron/icon/badge align to the top of a tall row.
   With these + `renderLabel` returning a stacked block, a node renders any number
   of visual lines; height grows naturally (no fixed height anywhere).

## Dividers
First-class nodes (`isDivider`). No new handling needed for virtual:
- `<Tree>`: render a rule; **search drops them** (`pruneNode → null`) so no orphan/
  adjacent dividers when neighbors filter out.
- `flattenVisible`: included with `navigable: false`.
- `<VirtualTree>` (future): measured like any row (small height; id-keyed cache).
  Keyboard nav + a11y read `navigable` to skip them (`role="separator"`, not
  `treeitem`). Require a stable `id` (flatten key / height cache).

## `<VirtualTree>` — future design (NOT built here)
```
data + expanded + searchQuery
  → pruneNode (search, shared)
  → flattenVisible → FlatRow[]
  → createVirtualizer(@tanstack/solid-virtual) over FlatRow[]
      • estimateSize = common row height; measureElement for variable height
      • height cache keyed by node.id (prune rebuilds objects each keystroke)
  → render window: <TreeRow node depth> absolutely positioned (translateY)
  → selection: find flat index of selectedId → scrollToIndex
  → a11y: role=tree/treeitem/separator, aria-level/setsize/posinset, aria-expanded/selected
```
Constraints accepted: bounded-height viewport, optional peer dep, measurement/
estimate tuning, windowed DOM (Ctrl-F + SR see only the window unless setsize/posinset
provided). Build trigger: a real list (users) crossing a few thousand rows.

## a11y (delivered across every tier)
Tree and VirtualTree share `role="tree"`, named-root props, roving `treeitem`
focus, `aria-level/expanded/selected`, and arrows/Home/End/Enter/Space. Visual
dividers are presentation-only and omitted from the accessibility tree. Virtual
navigation resolves against the full visible-row list, scrolls an unmounted
target index into the rendered window, then focuses it after render.
DatabaseTree/SupabaseTree inherit the same VirtualTree path.
