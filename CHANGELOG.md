# Changelog

All notable changes are listed here. While on 0.x, a minor version may contain
breaking changes; they are always marked **Breaking**. Defect IDs refer to
[docs/ANALYSIS.md](docs/ANALYSIS.md).

## Unreleased

### Added (phase 8: examples, docs, site)
- Example gallery (`examples/`): 15 examples, from quick start to drag-and-drop. Each is
  also a browser test (it renders, axe is clean, and its scripted check passes). A
  "Run all checks in this browser" button runs every check live.
- Guides (`docs/guide/`): getting started, concepts, data sources and adapters, theming
  (the token table is generated and drift-tested), performance, testing, migration from
  0.x. A TypeDoc API reference (`npm run docs:api`). A rewritten README and AGENTS.md.
- `npm run site` and a Pages workflow: gallery + API + test report + coverage.
- From example-writing feedback: `defaultExpandedIds`; `controllerRef` on prop-driven
  views; `onRename` may return a string as the rejection reason; `onRemoteChange` on the
  database tier; `source.compare` also orders fetched lists; error rows show the reason
  and retry by keyboard (Enter on the parent) and for the roots;
  `createMemorySource.failNext`; `CheckMode`/`DropPosition`/`SelectionMode` exported
  from the main entry.

### Changed (phase 8)
- **Breaking (behavior):** toggling a *mixed* checkbox now checks the whole branch (it
  used to uncheck it), matching the common tri-state convention.
- Fixed: cascade checking no longer checks disabled descendants or counts them for the
  parent (G9).
- Error placeholder rows always use the built-in rendering (`renderLabel` is for real
  nodes).

### Added (phase 7: features — see docs/SPEC-features.md)
- **Inline rename:** `onRename` (enables it), `canRename`, `renameOnBlur`,
  `onRenameError`. F2 or `startEditing(id)`; Enter commits, Escape cancels. The new label
  shows optimistically while `onRename` runs and rolls back on `false` or rejection.
- **Checkboxes:** `checkable` (boolean or predicate), `checkMode` cascade or strict,
  controlled `checkedIds` + `onCheckedChange`. `aria-checked` sits on the treeitem. Space
  toggles. A lazy branch whose children are not loaded keeps its explicit value.
- **Drag-and-drop and keyboard moves:** `onMove` (enables it), `canMove`,
  `optimisticMoves`. Pointer drag (5 px threshold, 400 ms touch long press) with
  before/inside/after zones, an inline drop indicator, hover-to-expand, auto-scroll
  (also in `<VirtualTree>`), multi-selection drag and Escape to cancel.
  Ctrl+Shift+Arrows move by keyboard, with live announcements. `moveNodes()` helper for
  in-memory data. `TreeSource.move` is used by the database tier by default.
- Realtime `move` changes honor their `index`.

### Changed (phase 4: views + accessibility)
- **Breaking (markup):** rows are rendered flat. Each row is a `.solid-tree-row` wrapper
  (`role="none"`) around a `.solid-tree-item` treeitem. `<Tree>` no longer nests DOM by
  depth; ARIA level/posinset/setsize describe the hierarchy (E1). State attributes
  (`data-selected`, `data-depth`, `data-variant`, `data-dimmed`, `data-has-children`)
  are on both elements, so existing CSS hooks keep working.
- **Breaking:** the actions slot is `aria-hidden`, and its controls are out of the tab
  order. Actions are pointer shortcuts; offer the same commands by keyboard (G6, see
  docs/ACCESSIBILITY.md).
- **Breaking (look):** default `--tree-count-opacity` is 0.6 (was 0.5) and
  `--tree-dim-opacity` is 0.55 (was 0.38), to meet WCAG AA contrast (found by axe).
- Rows keep their identity across searches and data changes; they are no longer
  remounted on every keystroke (G2). A reused virtual slot switches correctly between
  node, separator and placeholder rows (B1).
- Focus: the Tab stop remembers the focused row even when it is scrolled out of a virtual
  window (E5). Clicking a visible row no longer scrolls (E6). `:focus-visible` outline (E4).

### Added (phase 4)
- `@timotholt/solid-tree/headless`: `createTreeView` (ARIA, focus and input as prop
  getters for any markup) plus the framework-free core.
- Double-click activates. Ctrl/Cmd-click toggles, Shift-click extends, Ctrl/Cmd+A
  selects all and Shift+Arrow extends, in `selectionMode="multiple"`.
- `aria-busy` on loading branches and a polite live region announcing search results
  (E2). Error placeholder rows retry on click.
- `renderLeading` slot (before the icon), `dir="rtl"`, `scrollToId` wired in both views,
  `controller.matchCount()`, `controller.highlightQuery()`, `controller.isDimmed()`.
- theme.css: `data-density="compact"`, dark mode (`prefers-color-scheme` or
  `data-theme`), focus and error tokens.
- docs/ACCESSIBILITY.md: semantics, keyboard map, actions guidance, manual checklist.

### Removed (phase 4)
- `TreeController._ctxState` (internal; replaced by public accessors) (C6).

### Changed (phase 6: Supabase tier)
- **Breaking:** the lock heartbeat now beats by default even while the window is
  unfocused (`heartbeatPolicy: "always"`). `"focused"` restores the old behavior, where
  an idle background tab let its lock expire (D11).
- **Breaking:** the held lock is released on unmount and on `pagehide` (a keepalive
  request), so closing a tab no longer holds the record until the TTL expires
  (`releaseOnDispose: false` opts out) (G4).
- The lock follows `onAuthStateChange`: signing in as someone else drops the previous
  user's lock. `acquire`/`release` calls are serialized, and heartbeats never overlap (B8).
  Lock state has a single source of truth (D10).
- Each realtime subscription gets its own channel, so two trees on one table no longer
  share and kill each other's channel (B3). UPDATE events carry the parent id, so moves
  are detected (B6).
- Rows load with keyset pagination on (order column, id), which never skips or repeats
  rows while others write (D12).
- `<SupabaseTree>` accepts every Supabase option, including the previously missing
  `lockRpc`, `lockedBy`, `heartbeatPolicy` and `releaseOnDispose` (D3).

### Added (phase 6)
- `supabase/migrations/0003_solid_tree_lock.sql`: `solid_tree.install_lock(table, …)`
  installs record locking on any table. Options: name prefix, TTL, id column (any type),
  admin claim, and an opt-in restrictive holder-only UPDATE policy (G7). Tested against
  real Postgres (PGlite) with no Docker needed.

### Changed (phase 5: database tier)
- **Breaking:** loading/error placeholders are synthesized rows (`kind: "placeholder"`,
  id `<parent>::placeholder`), not fake data nodes. They are not selectable and not in
  the index (B5). `LOADING_TYPE` is now an alias of `PLACEHOLDER_TYPE`.
- Cache keys are namespaced per controller (`queryKeyPrefix`), so trees sharing a
  QueryClient no longer show each other's data (B2). Disposing a tree removes its
  entries from a shared client and clears a client it created (G5).
- Concurrent child loads are bounded (`maxConcurrentLoads`, default 4) (G5).
- Realtime: `move` changes and updates whose parent changed are applied. Inserts honour
  `source.compare`. A leaf that gains a child becomes expandable. Removing a node drops
  its loaded subtree's cache (B6, B7). A moved node that was never loaded makes the tree
  refetch its new parent. Patches apply in one batch, so a move never shows a node twice.
- In production builds, a duplicate id is skipped and reported instead of crashing the
  tree. Development builds still throw.

### Added (phase 5)
- `loading(id)`, `error(id)` and `retry(id)` (`null` = the roots), and error placeholder
  rows (B4).
- Server-side search: `source.search` is used while a query is active, and hits are
  revealed through `source.getAncestors` (`serverSearch: false` opts out) (D6).
- `TreeSource.compare` and `TreeSource.getAncestors`.
- `@timotholt/solid-tree/testing`: `createMemorySource` (latency, seeded failures,
  realtime mutations, search) and `runTreeSourceContract`, a conformance suite for
  TreeSource adapters.

### Changed (phase 3: state + controller)
- **Breaking:** controlled inputs (`selectedId`, `selectedIds`, `expandedIds`,
  `searchQuery`) are controlled when the prop/option is **passed**, decided once.
  `<Tree data onSelect>` without `selectedId` now keeps its own selection (A1). Use
  `null` for "controlled, nothing selected".
- **Breaking:** collapsing an ancestor of the selection no longer selects that ancestor
  (and no longer fires `onSelect`). Opt back in with `selectAncestorOnCollapse` (B11).
- **Breaking:** `FlatRow` has more fields (`id`, `kind`, `level`, `posinset`, `setsize`,
  `expanded`, `parentId`, `placeholder`). The old ones (`node`, `depth`,
  `hasChildren`, `navigable`) are unchanged.
- **Breaking:** `TreeController.selectedId()` returns `null` (not `undefined`) when
  nothing is selected.
- Every controller option and component prop is live: changing `matcher`,
  `filterMode`, `rowClickPolicy`, `canSelect` and the others at runtime takes effect (G1).
- Search no longer writes the user's expansion state. Toggles while searching are
  temporary, never persisted, and reset when the search ends (A2). Search opens only the
  ancestors of matches, not a matched node's own subtree (A3).
- Restored expansion drops ids that no longer exist (B9). A selection whose node leaves
  the data is cleared (B7). The initial selection is revealed in the first render,
  including on the server (G8).

### Added (phase 3)
- `selectionMode: "multiple"` with `toggleSelected`, `selectRange`, `selectAll` and
  controlled `selectedIds`. `onSelectionChange(ids)` reports every change, including
  `deselect()` (B10).
- Controlled expansion (`expandedIds` + `onExpandedChange`). `persistence` adapters
  (`localStoragePersistence`, `memoryPersistence`; the stored format is unchanged).
- `onActivate` (Enter). Type-ahead. `*` expands sibling parents. RTL-aware arrow keys.
  `disabled` nodes (focusable, not selectable). `scrollToId`. `revealSelection`.
- Dev warnings: a controlled value that becomes `undefined`, and `tree={...}` combined
  with props it ignores (D5). Duplicate node ids throw an error naming the id.
- `TreeChange` gains a `move` type and an optional `parentId` on `update` (moves
  are wired up in phases 5 and 6).
- Internal: the framework-free core (`src/core/`) and the new source layout (`core/`,
  `state/`, `controller/`, `view/`, `database/`, `supabase/`).

### Changed (phases 0–2)
- **Breaking:** peer minimums are now the versions the test suite verifies:
  `solid-js` ≥ 1.9.16, `@tanstack/solid-virtual` ≥ 3.13.32, `@tanstack/solid-query`
  ≥ 5.30.0, `@supabase/supabase-js` ≥ 2.45.0.
- `<VirtualTree>` uses upstream `@tanstack/solid-virtual` (≥ 3.13.32 contains the
  measurement fix the package used to fork). The fork is deleted (C2).
- Source imports use `.js` specifiers instead of `.jsx`, so bundlers other than Vite can
  compile the `solid`-condition source (C4).

### Added
- `node` export condition with a server-compiled build (`dist/server/`): the package
  imports in Node and renders to HTML without hydration (C3).
- `prepare` script: git installs now build `dist/`, so the `import` entry and type
  declarations exist for git consumers (C1).
- LICENSE file (C7).
- Test harness (Vitest unit, DOM and real-browser projects), CI, packaging checks
  (tarball consumer, publint, attw) and bundle-size budgets.

## 0.16.0 and earlier

See the git tags.
