# solid-tree — analysis and defect ledger (v0.16.0, 2026-10-20)

This is the input to [PLAN-rebuild.md](PLAN-rebuild.md). Every defect has a stable ID.
Regression tests reference these IDs in their names (`regression(A2): ...`), and the
plan's phases say which IDs they close. IDs are never reused.

Evidence key: **run** = reproduced by executing code against v0.16.0. **read** = high
confidence from reading the code; the Phase 0 characterization tests confirm or retract it.

**Phase 4 status (2026-10-20):** also closed: B1, C6, E1–E7, G2, G6 (as documented
pointer-only actions). No ledger defect is open. Not yet done: the screen-reader checks and
the Docker integration job.

**Phase 6 status (2026-10-20):** also closed: B3, B6 (source), B8, D10, D11, D12, G4, G7.
Still open: B1, E1, E5, G2 (Phase 4 views); G6 (Phase 4).

**Phase 5 status (2026-10-20):** also closed: B2, B4, B5, B6 (database controller; the
Supabase source half remains for Phase 6), B7 (subtree cache), D6, G5. Still open: B1, B3,
B6 (source), B8, E1, E5, G2, G4, G7.

**Phase 3 status (2026-10-20):** closed, each with a `regression(<ID>)` test: A1, A2, A3,
B7, B9, B10, B11, D3, D5, D7, G1, G8. Still open: B1–B6, B8, E1, E5, G2, G4, G5, G7
(Phases 4–6).

**Phase 0 status (2026-10-20):** a `knownDefect(<ID>)` test now reproduces each of
A1, A2, A3, B1, B2, B3, B4, B5, B6, B7, B8 (three cases), B9, B10, B11, E1, E5, G1, G2,
G4 and G5. Those tests pass only while the defect exists. G3 is retracted. B4 is
reproduced as "no error API exists", which is the defect.

## What is good (keep)

- Pure, shared keyboard resolver (`navigation.ts`).
- Tiered subpath exports with genuinely optional peers.
- Controller/view split (TanStack "instance + markup").
- Token system: one source of style literals, em-scaled from `--tree-font-size`.
- `TreeChange` realtime protocol, and server-enforced locking backed by SQL and an
  adversarial audit (`supabase/test/lock-audit.ts`).
- Comments that explain why (onMount gotcha, #1203 patch, self-heal effect).

## A. Defects reproduced by running

| ID | Defect | Effect |
|---|---|---|
| A1 | `coreOptionsFromProps` always passes `selectedId`/`searchQuery` accessors, so the controller always treats them as controlled. | `<Tree data onSelect>` without `selectedId` never shows a selection. A props-built controller ignores `setSearch`. |
| A2 | Toggling a node that search force-expanded computes `!expanded[id]` from the saved state. | User cannot collapse during search. The click saves `expanded=true` and fires `onToggle(id,true)`. The node stays open after the search clears and is persisted. ArrowLeft has the same bug. |
| A3 | A matched node keeps its whole subtree, and `collectExpandable` force-opens all of it. | Searching for a parent opens every descendant. `flatRows` becomes the whole tree, which defeats virtualization. |

## B. Defects from reading

| ID | Defect | Effect |
|---|---|---|
| B1 | `VirtualTree` reuses row slots by index. `TreeRow` branches on `isDivider` once at setup and never again. | A reused slot renders a divider for a real node, or a row for a divider. |
| B2 | `ROOTS_KEY` is a global constant, and children are keyed by node id only. | Two `DatabaseTree`s that share a `QueryClient` show each other's data. |
| B3 | The Supabase channel name is fixed per table, and realtime-js `channel()` dedupes by topic. | The second tree's listener lands on the first tree's already-joined channel, and postgres_changes bindings are sent at join, so the second listener likely never registers. Unmounting either tree kills realtime for both. |
| B4 | `loadChildren` swallows errors. A roots error yields `[]`. | "Loading…" or an empty tree forever, and no error API. |
| B5 | Loading placeholders are real, focusable, selectable treeitems. | `onSelect` receives fake `__loading` nodes, and screen readers announce them. |
| B6 | A realtime UPDATE that changes the parent column (a move) is not handled. It is also undetectable today: `TreeChange.update` has no `parentId`, `toNode` discards the parent column, and Supabase `old` holds only the PK without `REPLICA IDENTITY FULL`. Inserts ignore `orderBy`. A `leaf:true` node never gains a chevron from an INSERT of its first child (an UPDATE setting `leaf:false` does work). | The live tree drifts from the database. |
| B7 | Remove leaves the subtree's lists in `childrenStore`, and selection can point at a deleted id. | Leak, and the app is left holding a dead selection. |
| B8 | The lock caches the user id forever (`lock.ts:57-62`). `acquire` is not serialized. Heartbeats can overlap (`setInterval(async …)`). (Corrected after review: the reference `acquire_lock` SQL already releases the caller's other locks atomically, so the client-side release at `lock.ts:96` is a redundant no-op, not a race.) | Wrong lock state after a user switch or under concurrency. |
| B9 | Persisted expand state never prunes stale ids. The mount replay fires `onToggle` for ids that may no longer exist. | localStorage grows without bound, and DB tiers fetch ghosts. |
| B10 | `deselect()` only clears the internal signal and emits no event. | Silent no-op in controlled mode. |
| B11 | Collapsing an ancestor of the selection moves selection and fires `onSelect`. | The app receives selections the user never made. |

## C. Packaging and distribution

| ID | Defect |
|---|---|
| C1 | **run:** git installs contain no `dist/` (it is gitignored and there is no `prepare` script). `main`, `types` and `import` point at nothing. Confirmed in the passthern/question-editor and CruelDeal `node_modules`. |
| C2 | The forked `createVirtualizer` relies on private `_willUpdate`/`_didMount` with `@ts-nocheck` while the peer range is `^3.0.0`. Upstream `src/index.tsx` matches the fork from **3.13.32** on (3.13.31 and the installed 3.13.29 still call `measure()`), so the fork is obsolete. The peer minimum becomes `^3.13.32`. |
| C3 | The compiled `dist` is a DOM build but is advertised as the SSR fallback. |
| C4 | The raw `solid`-condition source imports `./X.jsx` for `.tsx` files. That is Vite-only behavior. |
| C5 | The peer range `solid-js ^1.6` is untested. Dev uses 1.9. |
| C6 | Internals are exported (`storage`, `flattenVisible`, `LOADING_TYPE`, `_ctxState` on the public controller type). |
| C7 | No LICENSE file, no CI, no CHANGELOG. The README pins `^0.13.0`. The theme.css comment lists stale px defaults. |

## D. Architecture

| ID | Flaw |
|---|---|
| D1 | No normalized index. Every lookup walks the nested tree, and there are no parent pointers. Root cause of A3, B9 and the cost of D7. Blocks DnD, checkboxes and ranges. |
| D2 | The core controller mixes expansion, persistence, selection, search, reveal policy and the view bridge. |
| D3 | Option lists are copied by hand in 4+ places. Drift has already happened (A1; `lockRpc`/`lockedBy` are missing from `<SupabaseTree>`). |
| D4 | Views import helpers from `Tree.tsx`. |
| D5 | `tree={...}` silently ignores conflicting props. |
| D6 | Search re-prunes the whole tree per keystroke. `TreeSource.search` is declared but never called. |
| D7 | `flatRows()` is not memoized in the controller and is called several times per key press. |
| D8 | `TreeNodeData` mixes data and presentation. Dividers are fake nodes. `payload: any`. `type` is required but never used by the component. |
| D9 | `TreeRow` fuses behavior, ARIA and about 40 inline style declarations. No headless mode and no extension points. Inline styles beat consumer CSS. |
| D10 | Lock state is duplicated (lock `heldId` plus a controller signal, synced by hand). |
| D11 | Skipping the heartbeat on `!document.hasFocus()` is hard-coded. |
| D12 | Supabase loads use offset pagination, which skips or duplicates rows under concurrent writes. |

## E. Accessibility

| ID | Gap |
|---|---|
| E1 | No `aria-setsize`/`aria-posinset`. Required for virtualized trees. |
| E2 | No `aria-busy` while loading. No live announcement of the search result count. |
| E3 | No type-ahead. No `*` (expand all siblings). |
| E4 | No `:focus-visible` styling. |
| E5 | In `VirtualTree`, Tab lands on the first rendered row when the focused row has scrolled out. |
| E6 | Minor (corrected after review): a click calls `scrollToIndex(…, { align: "auto" })`, which scrolls only when the clicked row is partly outside the viewport. VS Code does the same. Skip it when the row element already exists. |
| E7 | No automated accessibility verification. |

## F. Testing

| ID | Gap |
|---|---|
| F1 | One test file (pure navigation). No DOM environment. No tests for the controller, search, persistence, virtual, database, realtime or lock client. |
| F2 | No browser tests for virtualization, which is the riskiest code. |
| F3 | Examples are manual demos and are not exercised by any test. |

## G. Found in the adversarial review (2026-10-20)

| ID | Evidence | Defect |
|---|---|---|
| G1 | read | `coreOptionsFromProps` reads `matcher`, `filterMode`, `storageKey`, `onSelect`, `onToggle` and `canSelect` once, non-reactively (`Tree.tsx:28-34`). `rowClickPolicy` is read once too (`Tree.tsx:55`). Changing these props at runtime does nothing. |
| G2 | read | Prune mode clones every surviving node (`search.ts:16-19`), so `<Tree>`'s identity-keyed `For` remounts every row on every keystroke. |
| G3 | **retracted** | Claimed: `getItemKey` reads `rows()` untracked (`VirtualTree.tsx:107`), so a same-count row change would not notify the virtualizer. The Phase 0 browser test shows rows replaced 1:1 render correctly. Kept as a characterization test. |
| G4 | design | The lock is never released on unmount or `pagehide` (`lock.ts:125`, `supabase/controller.ts:77`). It is held until the TTL expires. |
| G5 | read | The `new QueryClient()` made per controller (`DatabaseTreeController.ts:46`) is never cleared. `expandAll()` on a DB tree fires N child loads at once. |
| G6 | a11y | `renderActionNode` puts focusable controls inside a `treeitem`, a composite-widget violation that axe does not catch. |
| G8 | run | Revealing the selection's ancestors (and the persisted-expansion replay) runs in effects, which do not run during SSR. A server render shows the selection collapsed while the client shows it revealed. Found by the Phase 1 package test. Fix in Phase 3: derive the initial expansion synchronously. |
| G7 | design | The shipped lock SQL hard-codes `scratch_lock_demo` (`supabase/migrations/0001_scratch_lock.sql`). The `/supabase` tier is unusable without consumers rewriting the SQL. |
