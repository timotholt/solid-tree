# Plan — rebuild solid-tree to 1.0

Status: **v2, accepted** (2026-10-20). Execution started. v1 was adversarially reviewed
(Fable). The review's blockers and majors are folded in, and a change log is at the
end. Input: [ANALYSIS.md](ANALYSIS.md). Defect IDs (A1…G7) refer to it.

## 1. Goal

A public, npm-published 1.0 that a SolidJS developer would pick over writing their own:

- correct: every ledger defect closed, each with a regression test;
- accessible: WAI-ARIA tree pattern complete and verified by automated checks;
- fast: 100k nodes in `VirtualTree`, with scaling verified by tests;
- extensible: headless primitives under the styled default;
- complete for real apps: multi-select, checkboxes, inline rename, drag-and-drop;
- current: latest TanStack Virtual/Query, Vite 8, Solid 1.9;
- learnable: runnable examples, recipes, generated API reference.

### Non-goals for 1.0

- Solid 2.0. The core stays framework-free (§3) so a port is cheap. A non-blocking
  nightly CI job runs against `solid-js@next` from Phase 4 on.
- SSR rendering. However, "importing the package in Node without `window` does not
  throw" **is** a goal and is tested, because SolidStart users import components
  server-side.
- Other frameworks, tree-tables or columns, external (OS file) drops, a hosted docs
  site beyond GitHub Pages.

### Approach

An incremental rebuild behind tests, not a big-bang rewrite. Phase 0 freezes current
behavior. Each phase replaces one layer, keeps the gate green, and is independently
revertable. The public API breaks once, at 1.0, with a migration guide. 0.x minor
bumps may break, and every break is in the CHANGELOG.

## 2. Principles

1. **Pure core, thin reactive shell.** Algorithms are plain TypeScript with no Solid
   import (lint-enforced), covered by unit and property tests.
2. **One source of truth per fact.** Option keys are declared once, and everything
   else is derived from that list (D3). Lock state lives in one place (D10).
3. **Every option is reactive.** Each option is an accessor, read where it is used and
   never captured at setup (G1).
4. **Controlled iff passed, decided once.** An input is controlled when its key is
   present on props at mount (`"selectedId" in props`, which survives `splitProps` and
   spreads). `null` means "controlled, nothing selected". A dev warning fires if a
   controlled value later becomes `undefined`. This avoids mode flips when a parent
   starts with `createSignal<string>()` (A1).
5. **Search never writes user state.** Search-driven expansion lives in an ephemeral
   layer that is discarded when the query clears and is never persisted (A2).
6. **Bug → ID → failing test → fix.** See §5.3.
7. **Every example is a test.** See Phase 8.
8. **Measured, not assumed.** Scaling and bundle size are gated. Absolute timings are
   tracked but not gated (§6).

## 3. Target architecture

```
src/
  core/                      pure TS, no solid-js import (lint rule)
    tree-index.ts            buildIndex(nodes, accessors) → { byId, parentOf, childrenOf, depthOf, order }
    search.ts                searchView(index, query, matcher, mode) → { visible:Set, matches:Set, openAncestors:Set }
    flatten.ts               flatten(index, expanded, view) → FlatRow[] { kind, id, level, posinset, setsize }
    navigation.ts            resolver + type-ahead + "*" + RTL + disabled-skip
    selection.ts             reducers: single | multiple (toggle, range from anchor, all)
    checks.ts                explicit-set checkbox model, cascade | strict
    moves.ts                 canMove / applyMove
  state/                     Solid primitives, one concern each
    createExpansion.ts       controlled or uncontrolled + PersistenceAdapter
    createSelection.ts
    createSearch.ts          query, debounced, memoized searchView, ephemeral open layer
    createReveal.ts          revealSelection (default on), selectAncestorOnCollapse (default off)
  controller/
    options.ts               CORE_OPTION_KEYS: the only list; pickCore + propsToOptions derived
    createTreeController.ts  composes state/*; memoized index + flatRows; scrollToId bridge
  view/
    headless/                getRootProps() / getItemProps(row) / getGroupProps(),
                             functions called inside JSX spreads (Zag/Kobalte style)
    TreeRow.tsx              styled default on getItemProps
    Tree.tsx, VirtualTree.tsx
    internal/adapters.ts
  database/                  createDatabaseTreeController, DatabaseTree
  supabase/                  supabaseSource, lock, createSupabaseTreeController, SupabaseTree
  testing/                   runTreeSourceContract(), createMemorySource()
```

Public subpaths: `.`, `/virtual`, `/database`, `/supabase`, `/headless`, `/testing`,
`/theme.css`. Nothing else is exported (C6).

### Data model and row contract (decided in Phase 3, before the parallel fork)

- `TreeNodeData<P = unknown>`: `id`, `label`, `children?`, `payload?: P`, optional
  `icon`, `badge`, `disabled`. `type` becomes optional (D8).
- `idAccessor` / `childrenAccessor` / `labelAccessor` options let foreign data shapes
  work without mapping.
- Separators are `{ kind: "separator" }` items. The index skips them, and no
  algorithm special-cases them (D-3).
- **`FlatRow.kind: "node" | "separator" | "placeholder"`.** Placeholders (loading,
  error, load-more) are rows that the controller synthesizes from `loading(id)` /
  `error(id)` state. They are never data nodes, never selectable, and never counted
  in `setsize` (B1, B5).
- `TreeChange` gains `{ type: "move"; id; parentId; index? }`, and `update` gains an
  optional `parentId`. The controller detects moves by comparing against
  `index.parentOf(id)`, so it never needs Supabase's `old` row (B6).
- `onActivate(node)` (Enter, double-click) is separate from `onSelect`.

## 4. Phases

Each phase lists its scope, the defects it closes, its tests and its exit criteria.
**Gate** = `npm run gate` (§6).

### Phase 0 — Toolchain and characterization (local, blocks everything)

Local because it is all tooling decisions.

- **Prerequisite: Node 22.12+ locally** (the machine has 20.20). Start from a clean
  `npm ci`, and resolve the stray `package-lock.json` diff first.
- **Toolchain bump, moved here from Phase 1** because Vitest 5 needs Vite ≥ 6.4 and Node
  ≥ 22.12: Vite 8, `vite-plugin-solid` 2.11.14, Vitest 5. The examples app is bumped too.
- Vitest projects:
  - `unit`: node with the browser condition. Assert `isServer === false` once, so a
    misresolved Solid build fails loudly.
  - `dom`: happy-dom + `@solidjs/testing-library`. Assert `isServer === false` here too.
  - `browser`: Vitest browser mode with `@vitest/browser-playwright`. Chromium on every
    PR. WebKit and Firefox run nightly.
- Global test setup: **any `console.warn` or `console.error` fails the test**, unless the
  test expects it explicitly. This catches Solid dev warnings such as
  "computations created outside a root".
- `knownDefect(id, fn)` helper. It passes only when `fn` fails with an assertion
  error. If `fn` throws any other error (a broken fixture), the helper fails. If `fn`
  passes, the helper fails with "<id> is fixed — convert to regression(<id>)". This
  replaces bare `it.fails`, which also passes on a TypeError.
- GitHub Actions: the gate on PR and push, on Node 22 and 24.
- Characterization tests: every public controller method and every component prop.
- Known-defect tests: A1–A3, B1–B11, E1, E5, G1–G3, G5. Any "read" defect the tests
  disprove is retracted in ANALYSIS.md.

Exit: gate green locally and in CI with all of the above.

### Phase 1 — Library peers and packaging (parallel with Phase 2)

**Done 2026-10-20.** Outcomes:
- The fork is deleted. The C2 baseline fails on 3.13.31 and passes on 3.13.32+.
- Peers bisected and tested. Query 5.30.0 is the first version that passes.
  solid-js 1.9.16 is the floor because `dist` is compiled with babel-preset-solid 1.9.16.
- TS 7 typechecks this code, but typescript-eslint does not support it (no JS API), so
  TypeScript is pinned to 6.0.
- A server build under the `node` condition replaces "drop the SSR claim". The tarball
  test proved the DOM build throws on import in Node. Found G8.

- `@tanstack/solid-virtual` → 3.13.48, peer `^3.13.32`. `@tanstack/solid-query` →
  5.104.x. `@supabase/supabase-js` → 2.118.x. `solid-js` → 1.9.17. Peer ranges =
  tested ranges. A nightly job runs the lowest supported peer set (C5).
- **Delete the `createVirtualizer` fork (C2).** First add the browser regression test
  "measured row heights survive expand/collapse" while still on the fork. Then swap to
  upstream and keep it green.
- TypeScript 7 spike, one session. The build uses Babel through vite-plugin-solid, so
  only declaration emit is at risk. If TS 7 fails, pin 5.9 and record why.
- Change the `.jsx` import specifiers to `.js` across src (C4). Phase 2 creates only
  new files, so the two phases don't collide.
- `prepare` script so git installs build `dist` (C1). A tarball test: `npm pack`,
  install into a temporary consumer, type-check an import from every subpath, and
  import every subpath in plain Node without `window`.
- Drop the SSR fallback claim from the README (C3, D-4). `publint` and `attw` in the
  gate. LICENSE file, CHANGELOG.md (C7).

Exit: no `@ts-nocheck` in src. Tarball and Node-import tests green.

### Phase 2 — Pure core (parallel with Phase 1; new files only)

**Done 2026-10-20.**
- `src/core/` holds the index, search, flatten, navigation (type-ahead, `*`, RTL,
  disabled), selection, checks and moves. 49 unit and property tests run 1000 times
  each.
- Mutation-checked: three planted bugs were each caught.
- 50k-deep trees work. Scaling tests are gated.
- 100k-node timings: index 10 ms, flatten 6 ms, search + flatten 29 ms.
- Design note: disabled nodes stay focusable by default (WAI-ARIA guidance) but cannot
  be selected. `skipDisabled` opts into skipping them.

- `tree-index`, `search`, `flatten` and the navigation extensions. Search opens
  ancestors of matches only (A3 design), keeps node identity (G2 design), and reports
  `visible`/`matches` as sets rather than cloned trees.
- `flatten` emits `kind`, `level`, `posinset` and `setsize` (E1 groundwork).
- Navigation: type-ahead with a timeout buffer, `*`, RTL (`dir` swaps ArrowLeft/Right),
  and skipping disabled nodes (E3).
- `moves.ts`: `canMove` and `applyMove`. `checks.ts`: the cascade/strict model.

Tests:
- Unit tests for everything.
- Property tests (fast-check, ≥ 1000 runs each):
  - flatten visits exactly the nodes with all ancestors expanded, in document order;
  - `posinset`/`setsize` agree with the sibling lists;
  - prune keeps exactly the matches and their ancestors;
  - navigation stays on visible, navigable rows;
  - the index round-trips, and duplicate ids are reported;
  - `applyMove` creates no cycles, no orphans, and preserves the remaining order;
  - checks: a parent's state is derivable from its loaded children (cascade), and an
    unloaded parent keeps its explicit value (never "mixed" from unknown children).
- **Scaling tests, gated:** operation counts or timing ratios between 10k and 100k
  nodes must stay within about n log n. Absolute ms numbers go to the trend job
  (§6), not the gate.

Exit: core green. **Phase 2 flips no controller defects.** A3 flips in Phase 3.

### Phase 3 — State, controller and the contracts (serial; the fork point)

**Done 2026-10-20.**
- Closed A1, A2, A3, B7, B9, B10, B11, D3, D5, D7, G1 and G8, each with a
  `regression(<ID>)` test. B7 needed no tier code: the controller drops a selection
  whose node leaves the data.
- Contracts frozen in [SPEC-contracts.md](SPEC-contracts.md). Layout restructured.
- Moved to Phase 4: G2. Rows remounting on keystrokes is a view concern; the
  `<For>`-by-id rendering lands with the view rebuild.
- Typeahead, `*`, RTL, `onActivate` (Enter) and disabled nodes landed early. Phase 4
  finishes E3 with double-click activation.

- State primitives: controlled or uncontrolled **expansion** (`expandedIds` +
  `onExpandedChange`), `PersistenceAdapter` with stale-id pruning and replay only for
  existing ids (B9), selection with `deselect` emitting a change (B10), search with
  the ephemeral layer (A2, A3), reveal policies (B11).
- `options.ts`: `CORE_OPTION_KEYS`, with every option an accessor (G1). A type test
  proves the key list equals `keyof CoreControllerOptions` (D3). Controlled iff
  passed (A1). Dev warning on `tree={...}` combined with conflicting props (D5).
- The controller memoizes the index and `flatRows` (D7). `scrollToId(id)` through a
  view-registered bridge.
- **Contracts frozen at the end of this phase, before Phases 4–6 run in parallel:**
  `FlatRow.kind` and placeholder synthesis from `loading(id)`/`error(id)` accessors,
  the `TreeChange` move type, `onActivate`.
- **Directory restructure, owned by this phase:** `git mv` into the §3 layout and fix
  imports, gate green, in one commit at the end of the phase.

Tests: unit tests per primitive. Phase 0's characterization suite still passes,
except for tests that intentionally flip. Regression test: "row components survive
keystrokes" (G2).

Exit: A1–A3, B9–B11, D5, G1, G8 closed (G2 → P4). Contracts documented in `docs/SPEC-contracts.md`.

### Phase 4 — Views, headless layer, accessibility (parallel with 5 and 6)

**Done 2026-10-20 (local).**
- Closed B1, E1–E7, G2 and C6 (`_ctxState`). G6 was resolved differently than planned.
- axe found three problems the plan had not predicted:
  - Count and dim contrast were below WCAG AA. The defaults were raised.
  - The G6 plan (actions beside the treeitem) violates `aria-required-children`. The
    actions now live inside the treeitem, aria-hidden and out of the tab order,
    documented as pointer shortcuts.
  - Empty and loading states were checked and pass.
- Harness bug found: `@solidjs/testing-library` did not clean up between tests (Vitest
  globals are off), so trees leaked across tests. Fixed in the shared setup.
- D9 decision: inline styles stay token-driven (overridable through CSS variables). Full
  control comes from `/headless`, not from moving cosmetics into a required stylesheet,
  which would break consumers who do not import theme.css.
- Not done: the manual screen-reader pass (docs/ACCESSIBILITY.md checklist).

Owns **every `*.tsx` file**, including `DatabaseTree.tsx` and `SupabaseTree.tsx`.

- Headless `getRootProps()`/`getItemProps(row)`/`getGroupProps()`. `TreeRow` is
  rebuilt on them and renders reactively by `row.kind` (B1).
- Cosmetics move from inline styles to `theme.css` classes that read the existing
  tokens (D9). Presets: default and compact. Light and dark via
  `prefers-color-scheme` and `data-theme`.
- ARIA: `setsize`, `posinset` and `level` everywhere (E1). `aria-busy` and a polite
  live region (E2). `:focus-visible` (E4). Focus memory across scroll-out (E5). Skip
  `ensureRowVisible` on click when the row is already rendered (E6). Error and loading
  placeholder rows, using the Phase 3 contract.
- `renderActionNode` moves into an `actions` slot outside the treeitem's focus order,
  with documented `role="toolbar"` guidance (G6).
- `getItemKey` tracks rows (G3).
- `<DatabaseTree>`/`<SupabaseTree>` props derived from the option key lists. This
  restores the missing `lockRpc`/`lockedBy` props (D3).

Tests: dom ARIA per row kind, a full keyboard matrix (key × row state → focus,
selection, expansion; including RTL and disabled), click policies; browser tests for
virtual slot reuse across kinds (B1), focus across scroll-out (E5), a 100k scroll
smoke test, axe on every example. Manual VoiceOver + Safari and NVDA + Firefox
checks once per release, recorded in `docs/ACCESSIBILITY.md`.

Exit: B1, E1–E7, G2, G6 closed.

### Phase 5 — Database tier state (parallel with 4 and 6)

**Done 2026-10-20 (local; the push was blocked, so it did not go to a cloud session).**
- Closed B2, B4, B5, B6 (controller side), B7 (cache leak), D6 and G5.
- Added `/testing`: the memory source and the contract suite.
- Two findings beyond the plan:
  - Query-cache notifications arrive on a later tick, which made realtime moves briefly
    duplicate a node. Fixed by mirroring the roots into a signal and applying each change
    in one batch.
  - Moves of unloaded nodes are now handled by refetching the destination.
- One small edit in Phase 4's area: `TreeRow` takes `hasChildren` from the row, so lazy
  branches work.

Owns `database/*` except views, and `testing/*`. It implements state only; Phase 4
renders it.

- Per-instance query keys (B2). `loading(id)`, `error(id)` and `retry(id)` (B4). The
  realtime `move` change, inserts ordered by a source `compare`, leaf→expandable on
  the first child insert (B6). Removal prunes subtree caches and clears dangling
  selection (B7). `expandAll()` on lazy trees is bounded by a concurrency limit, and
  the controller's own QueryClient is cleared on dispose (G5).
- Server search through `source.search` + optional `getAncestors(id)` (D6).
- `createMemorySource(tree, { latency, failRate, seed })` with `emit(change)`.
- `runTreeSourceContract(makeSource)`. Both the memory source and the Supabase source
  must pass it.

Tests: controller tests on the memory source, covering latency races, failure plus
retry, every change type on loaded and unloaded branches, two trees on one
`QueryClient`, and a disposal leak test (mount and unmount N times → timer count 0,
query cache size stable).

Exit: B2, B4–B7, D6, G5 closed.

### Phase 6 — Supabase tier (parallel with 4 and 5; integration job local)

**Done 2026-10-20, except the Docker integration job.**
- Closed B3, B6 (source half), B8, D10, D11, D12, G4 and G7.
- The SQL installer is tested on real Postgres via PGlite (WASM, in the gate). That test
  caught a bug: RLS with only an UPDATE policy hides every row. The holder policy is now
  restrictive, plus a grants passthrough when RLS was off.
- Not done: the nightly local-Supabase (Docker) job covering realtime, PostgREST and the
  live `lock-audit.ts`. It was not built because it could not be run here (memory) and
  unverified CI config was not shipped. Tracked as open work.
- Kept the client-side "release previous" call in `acquire`. The reference SQL makes it
  a no-op, but it protects custom RPCs that do not release atomically.
- `<SupabaseTree>` props are derived from `SUPABASE_OPTION_KEYS` (type-tested). This
  touched a Phase 4 view file because Phase 4 had not started.

Owns `supabase/*` except views, and the `supabase/` SQL folder.

- Per-instance channel names (B3). The source emits `parentId` on update, which
  makes moves detectable (B6).
- Lock: user id refreshed on `onAuthStateChange`, serialized `acquire`/`release`,
  single-flight heartbeat (B8). One lock state, exposed as a signal (D10).
  `heartbeatPolicy`, default `"always"` (D11). `releaseOnDispose` plus a `pagehide`
  release using `fetch(..., { keepalive: true })` (G4). Remove the redundant
  client-side release.
- **Productize the SQL (G7):** a table-parameterized migration (dynamic SQL with
  `format('%I')`, or a generator script registered as an npm script), plus docs.
  The audit runs against the generated SQL.
- Keyset pagination (D12).

Tests: unit tests with a fake Supabase client (serialization, overlap, user switch,
loss, dispose: fake channel count back to 0). **Integration job against a local
Supabase (Docker).** It runs nightly in CI, and locally before a merge: the contract
suite, realtime round-trips, `lock-audit.ts`, keyset pagination under concurrent
inserts.

Exit: B3, B8, D10–D12, G4, G7 closed.

### Phase 7 — Features (serial; specs written locally, implemented in cloud sessions)

**Done 2026-10-20 (local), per [SPEC-features.md](SPEC-features.md).**
- Multi-select, rename, checkboxes, and drag-and-drop with keyboard moves are all in,
  with controller, DOM and real-browser pointer tests (including touch long-press,
  auto-scroll and axe).
- Found while testing: realtime move changes ignored their `index`. Fixed.
- Follow-up (not done): the features are opt-in at runtime but always bundled. Core grew
  to 11.6 kB brotli. Make drag-and-drop and rename separately importable so unused
  features tree-shake out.

Before implementation, each feature gets a spec section in `docs/SPEC-features.md`,
written in a local session.

1. **Multi-select.** `selectionMode`, Ctrl/Cmd toggle, Shift ranges from the anchor,
   Ctrl+A, Shift+Arrow, `aria-multiselectable`, controlled `selectedIds`.
2. **Inline rename.** F2, double-click, or `startEditing(id)`. Enter commits, Esc
   cancels, blur commits (configurable). `onRename → boolean | Promise`. The
   optimistic overlay clears when the promise settles. A realtime update arriving
   mid-flight applies beneath the overlay, and the server wins after commit. Focus
   returns to the row.
3. **Checkboxes.** Explicit checked set, `cascade | strict`, `aria-checked="mixed"`,
   disabled nodes. An unloaded parent keeps its explicit state, which also makes
   "everything under X" expressible for server bulk operations. Space checks and
   Enter activates.
4. **Drag-and-drop and keyboard move.** Pointer events with pointer capture on the
   source, `touch-action: none` on the handle, and a long press to start on touch.
   The target is found with `elementFromPoint` + `data-index`, recomputed on
   pointermove **and** on scroll (auto-scroll moves rows under a still pointer).
   Before / inside / after positions with an indicator. Auto-expand on hover.
   `canMove`/`onMove` with optimistic update and rollback. Multi-select drag.
   Keyboard moves with live announcements. Works in `VirtualTree`. Optional
   `source.move`. External drops are out of scope.

Tests per feature: core properties, keyboard matrix, dom ARIA, browser interaction
(pointer and touch emulation), axe on its example.

### Phase 8 — Examples and docs (alongside each phase; finished after Phase 7)

**Done 2026-10-20 (local).**
- 15 examples, written by three parallel agents against a contract. Each is a browser
  test, and the gallery runs them live.
- Guides, a TypeDoc reference, the site build and a Pages workflow.
- The agents' feedback drove the API fixes in the CHANGELOG, plus one bug (G9) and one
  behavior change (mixed → checked).
- Verified: 15/15 live checks in real Chromium. The built site works served statically
  from a subpath.
- Not verified: the Pages workflow itself, which needs the push, Pages enabled and a
  public repo or paid plan.

15 examples. Each is self-contained, under ~150 lines, shown with its source, and
doubles as a browser test: it loads with no console errors, axe is clean, and it has
1–3 scripted interactions.

| # | Example | Shows | Lands in |
|---|---|---|---|
| 1 | Quick start | Minimal `<Tree>` | P3 |
| 2 | File explorer | Icons, persistence, controlled vs uncontrolled toggle, `onActivate` | P3 |
| 3 | Imperative controller | Toolbar: expand/collapse all, select, `scrollToId` | P3 |
| 4 | Search | Prune vs dim, highlight, fuzzy matcher, live-region count | P4 |
| 5 | Sidebar navigation | Separators, actions slot, badges | P4 |
| 6 | Theming and custom rows | Presets, dark mode, tokens, multi-line rows | P4 |
| 7 | Headless | Fully custom markup on `getItemProps` | P4 |
| 8 | 100k nodes | `VirtualTree` | P4 |
| 9 | Lazy REST | GitHub repo browser | P5 |
| 10 | Realtime without a backend | `createMemorySource`, live changes, errors and retry | P5 |
| 11 | Supabase + locks | Collaborative outline. It needs env, and without it shows a "how to run" panel. | P6 |
| 12 | Multi-select + bulk actions | | P7.1 |
| 13 | Inline rename | Async validation, rollback | P7.2 |
| 14 | Permissions checkboxes | Cascade vs strict, lazy branches | P7.3 |
| 15 | Drag-and-drop outline | Reorder, reparent, keyboard moves | P7.4 |

- The gallery is a Vite app in `examples/` with a sidebar, live demo and source panel,
  deployed to GitHub Pages from CI. `Spike`, `DatabaseDemo2` and `OutlineDemo` are
  folded into the table above or deleted.
- Docs: a short README (pitch, GIF, install, quick start). `docs/guide/`: getting
  started, concepts, theming, accessibility, data sources, writing an adapter (with
  the contract suite), performance, testing, migration from 0.x. A TypeDoc API
  reference. The theming token table is generated from `tokens.ts`, and a test fails
  when they disagree (closes the C7 drift class). AGENTS.md is kept current.

### Phase 9 — Release 1.0 (local, owner only)

- gitleaks over the full history. A finding stops the release: rotate first, then
  decide about history.
- Clean tool residue (`.serena/`), make the repo public, then publish to npm from CI
  with provenance on a tag.
- Smoke-test the passthern/question-editor and CruelDeal consumers against the packed
  tarball, following the migration guide.
- Announce: Solid Discord, r/solidjs, and a PR to awesome-solid.

## 5. Test strategy

### 5.1 Layers

| Layer | Tool | Runs |
|---|---|---|
| Pure unit + property | Vitest + fast-check | every PR |
| Reactive unit | Vitest (browser condition) | every PR |
| DOM | happy-dom + @solidjs/testing-library | every PR |
| Browser | Vitest browser mode, Chromium | every PR |
| Browser, other engines | WebKit, Firefox | nightly |
| Contract | `runTreeSourceContract` | every PR (memory source), nightly (Supabase) |
| Integration | local Supabase (Docker) | nightly + local before merging P6 |
| Packaging | tarball consumer, Node import, publint, attw | every PR |
| Leak | mount/unmount ×N: timers, query cache, channels | every PR |
| Scaling | ratio tests 10k vs 100k | every PR |
| Timing trend | `vitest bench` | nightly, non-blocking, relative threshold |
| Lowest peers | gate on the minimum peer set | nightly |
| Solid next | gate on `solid-js@next` | nightly, informational |

### 5.2 Coverage

≥ 90% lines and branches for `core/` and `state/`, ≥ 80% overall, enforced.

### 5.3 Regression policy

- A defect gets an ID in ANALYSIS.md, then a `knownDefect(ID)` test, then the fix,
  which converts the test to `regression(ID): …` in `tests/regressions/`.
- Regression tests are never deleted or weakened. An API change rewrites them against
  the new API in the same commit, and the commit message says so.
- Bugs reported by consumers are reduced to a regression test here.

### 5.4 Flakes

Browser tests retry once in CI. A test that needs its retry twice in a week is
quarantined with an issue, then fixed, or deleted with a stated reason, within its
phase.

## 6. Quality gate

`npm run gate`: typecheck → lint (including no solid-js in core/) → unit → dom →
browser (Chromium) → coverage → build → publint → attw → tarball consumer + Node
import → leak tests → scaling tests → size-limit.

Size budgets are set from measurement in Phase 1 and then only ratchet down. Starting
targets, excluding peers: core ≤ 8 kB gz, `/virtual` ≤ 12 kB, `/database` ≤ 16 kB.

## 7. Execution (cloud credits expire 2026-11-04)

```
P0 (local) ─┬─ P1 ─┐
            └─ P2 ─┴─ P3 (serial; contracts + restructure) ─┬─ P4 ─┐
                                                           ├─ P5 ─┼─ P7.1 → 7.2 → 7.3 → 7.4 ─ P9 (local)
                                                           └─ P6 ─┘
P8 examples land inside each phase
```

| Work | Where | Why |
|---|---|---|
| P0 toolchain + harness | **local** | tooling decisions, Node upgrade |
| TS 7 spike | **local** | a judgment call |
| P1, P2 | cloud, in parallel | mechanical, test-heavy |
| P3 | cloud, then a local contract review | fork point, so it needs owner sign-off |
| P4, P5, P6 code | cloud, three in parallel | disjoint file ownership |
| P6 Supabase integration run | **local** (Docker) or nightly CI | needs Docker |
| P7 specs | **local** | API design |
| P7 implementation | cloud, one at a time | follows the spec |
| Merges, consumer smoke tests, P9 | **local** | owner only |

- Cloud sessions run `npx playwright install --with-deps` in their setup script.
- Realistic timeline: P0–P3 by about 2026-10-30, then P4/P5/P6 in parallel before the
  credits expire. **Plan on P7 continuing locally after 2026-11-04.**
- Each cloud session gets this plan, ANALYSIS.md, its ownership row and its exit
  criteria. It ends with the gate green on its own branch. Merges are local, in graph
  order, rebased, with the gate re-run after each.

## 8. Risks

| Risk | Mitigation |
|---|---|
| TS 7 breaks declaration emit | Spike, then pin 5.9 |
| Upstream virtualizer differs from the fork | Regression test written on the fork before the swap |
| happy-dom gaps | Layout and focus tests live in the browser layer. `isServer` asserted. |
| Breaking the two consumers | Migration guide plus tarball smoke test before 1.0 |
| P7 scope creep | Spec first, exit criteria, extras deferred to 1.x |
| CI noise | No absolute-ms gates, Chromium-only on PR, other engines nightly |
| Parallel sessions conflict | Contracts and restructure frozen in P3. The ownership table. Local merges. |
| Credits run out mid-P7 | P7 is last and fine to finish locally |

## 9. Decisions (accepted 2026-10-20: owner said to proceed with all recommendations)

| ID | Question | Recommendation |
|---|---|---|
| D-1 | One API break at 1.0, with a migration guide? | Yes |
| D-2 | Keep the npm name `@timotholt/solid-tree`? | Yes |
| D-3 | Separators as `{ kind: "separator" }` items? | Yes |
| D-4 | Drop the SSR rendering claim for 1.0 (keep "imports in Node")? | Yes |
| D-5 | Supabase integration: nightly CI with Docker plus a local run before merging? | Yes |
| D-6 | `selectAncestorOnCollapse` defaults to off? | Off |
| D-7 | Heartbeat default `"always"`? | `"always"` |
| D-8 | Upgrade local Node to 22 LTS or 24? | 24 |

## Change log

- v2 (2026-10-20), after review:
  - Toolchain bump moved into P0, Node 22/24 (blocker).
  - A3 now flips in P3; P2 creates new files only (blocker).
  - Move-change contract plus `parentId` for B6 (blocker).
  - Contracts and directory restructure frozen in P3. Every `.tsx` owned by P4.
  - Controlled iff passed, decided at mount. Controlled expansion. All options reactive.
  - SQL productization (G7).
  - Scaling tests replace absolute-ms gates.
  - Scope cuts: Chromium on PR, no visual snapshots, 2 presets, 15 examples.
  - `knownDefect` helper, console-fail, leak and Node-import tests.
  - Accessors, `onActivate`, `scrollToId`, RTL, disabled nodes.
  - Detailed DnD, checkbox and rename specs.
  - Revised local/cloud split.
  - Ledger corrections (B3, B6, B8, C2, E6) and new defects G1–G7.
- v1 (2026-10-20): initial draft.
