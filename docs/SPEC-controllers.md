# Spec — controller architecture (instance + view), layered

> **Goal.** Give every tier an imperative **controller** (`createTreeController`,
> `createDatabaseTreeController`, `createSupabaseTreeController`) that owns state and
> exposes actions (`expand`/`select`/`loadChildren`/`acquireLock`…), with the JSX
> components becoming thin **views** that render from a controller. Keep the existing
> prop-based API working (a component builds its own controller when none is passed).
> This is the TanStack "instance + markup" split. It also lays the groundwork for the
> future framework-agnostic core (the controller IS the core) and for optimistic
> updates (one place that owns state + reconciles).

> **Principle:** measure twice. Ship in phases; each phase keeps the demo + audit green
> and is independently revertable. No big-bang rewrite.

---

## 1. Current state ownership (the audit we're refactoring)

| Concern | Today lives in | Notes |
|---|---|---|
| expand/collapse + persist | `createTreeState` (signal + localStorage) | owned internally ✅ |
| selection | **props** (`selectedId` + `onSelect`) | controlled by parent ❌ (no internal owner) |
| search/prune/dim | `createTreeState` (memo) | owned ✅ |
| auto-expand-to-selection, collapse-keeps-selection | `createTreeState` effects | owned ✅ |
| flatten (visible rows) | `flattenVisible` called in `VirtualTree` | pure fn |
| virtualizer / measure / scroll element | `VirtualTree` | DOM-coupled — stays in view |
| roots query + children cache + lazy load | `DatabaseTree` (createQuery + createStore) | data layer |
| realtime subscribe → cache patch | `DatabaseTree` (onMount + patchLists) | data layer |
| lock acquire/heartbeat/release | `createSupabaseLock` (standalone) | app wires select→lock |
| source (select→roots/children, realtime map) | `supabaseSource` | pure adapter ✅ |
| tokens / containerVars / row render | `createTreeState` + `TreeRow`/`TreeBranch` | view concern |

**Takeaway:** expand/search already behave like a controller; selection is the odd one
out (external), and the DB data layer + lock are not exposed as callable actions. The
refactor consolidates state into controllers and exposes actions, while leaving the
genuinely DOM-coupled bits (virtualizer, row DOM) in the view.

---

## 2. Target architecture

```
createTreeController(opts)            → TreeController            (in-memory data)
  └─ createDatabaseTreeController(opts) → DatabaseTreeController  (+ source/cache/lazy/realtime)
       └─ createSupabaseTreeController(opts) → SupabaseTreeController (+ lock, supabase preset)

<Tree         tree={c}/> | <Tree         {...opts}/>   // opts form builds the controller
<VirtualTree  tree={c}/> | <VirtualTree  {...opts}/>
<DatabaseTree tree={c}/> | <DatabaseTree {...opts}/>
<SupabaseTree tree={c}/> | <SupabaseTree {...opts}/>
```

- **Controller** = logical state + actions (Solid signals/stores under the hood).
- **View** = the JSX component: owns the virtualizer + row DOM + render-prop slots
  (`renderLabel`/`renderActionNode`), reads everything else from the controller.
- **Composition, not duplication:** each controller wraps the one below and adds its
  layer. `SupabaseTreeController` = `DatabaseTreeController` + lock.
- Virtualization stays in the view. The controller may later expose `scrollToId` via a
  small bridge the view registers — **out of scope for v1**.

### Solid constraint (document loudly)
`createXController()` creates signals/stores/effects/`onMount`/`onCleanup`, so it MUST be
called inside a component body or `createRoot` (a reactive owner). Calling it at module
top throws/leaks. We'll add a `getOwner()` dev warning. The controller's lifecycle
(subscriptions, cleanup) binds to where it's created — correct and intended.

---

## 3. Controller interfaces (concrete)

```ts
// Reactive reads are Accessors (Solid). Actions are sync or Promise.
interface TreeController {
  // ── state
  nodes:       Accessor<TreeNodeData[]>;            // source tree (DB: assembled w/ loaded children)
  flatRows:    Accessor<FlatRow[]>;                 // visible linearization (view feeds the virtualizer)
  expandedIds: Accessor<Record<string, boolean>>;
  selectedId:  Accessor<string | null>;
  searching:   Accessor<boolean>;
  noMatches:   Accessor<boolean>;

  // ── actions
  expand(id: string): void;
  collapse(id: string): void;
  toggle(id: string): void;
  expandAll(): void;            // in-memory: every node w/ children; DB: every LOADED node
  collapseAll(): void;
  select(id: string): void;
  deselect(): void;
  setSearch(query: string): void;

  // ── internals the view consumes (assembled into TreeCtx with the view's render props)
  _ctxState: Omit<TreeCtx, "renderLabel" | "renderActionNode">;
  _containerVars: () => JSX.CSSProperties;
}

interface DatabaseTreeController extends TreeController {
  loadChildren(id: string): Promise<void>;
  reloadChildren(id: string): Promise<void>;   // invalidate + refetch
  isLoading(id: string): boolean;              // accessor-backed
  subscribe(): void;                            // realtime on (auto-called on create)
  unsubscribe(): void;
}

interface SupabaseTreeController extends DatabaseTreeController {
  heldId: Accessor<string | null>;
  acquireLock(id: string): Promise<boolean>;
  releaseLock(): Promise<void>;
  releaseAllLocks(): Promise<void>;
  refreshLock(): Promise<void>;                 // manual heartbeat
}
```

### Deliberate non-goals for v1 (keep blast radius small)
- **Single selection only** (`selectedId`). Multi-select (`selectedIds: Set`) is a clean
  later addition — the API reserves room but we don't build it now.
- **No `select` → auto-`acquireLock` policy in the controller.** `select` and
  `acquireLock` stay separate primitives; the *app* decides "selecting a leaf locks it"
  (the demo already does). Controller stays unopinionated.
- **No optimistic updates yet** — but the controller is the home for them later
  (bump-balance optimistic + echo-dedup; locks stay confirm-first). Seam reserved.
- **No `scrollToId`** (needs a view bridge) — later.

---

## 4. Backward compatibility (must not break existing consumers)

Live consumers: the `?virtual/?database/?database2/?supabase` demos and the
`question-editor` review console (`<Tree>`). All keep working.

Each component accepts **either** form:
```ts
type TreeViewProps =
  | ({ tree: TreeController } & ViewOnlyProps)
  | (TreeControllerOpts & ViewOnlyProps);   // legacy: builds the controller internally

// in the component body (runs once):
const tree = "tree" in props && props.tree ? props.tree : createTreeController(props);
```
`ViewOnlyProps` = `renderLabel`, `renderActionNode`, `class`, `viewportStyle`,
`estimateSize`, `overscan`, `onRangeChange`, `basePadding`, `indentStep`,
`noMatchesLabel`. The view builds `TreeContext` from `tree._ctxState` + its render props.

`onSelect`/`onToggle`/`selectedId`/`searchQuery` remain accepted on the opts form and are
threaded into the controller (selectedId = controlled input mirrors into the controller;
onSelect/onToggle = event callbacks the controller fires). Documented precedence:
`tree` prop wins; otherwise opts build one.

---

## 5. File-by-file change list

**New**
- `src/core/controller.ts` — `createTreeController` (was `createTreeState`, now owns
  selection too + `expandAll`/`collapseAll`/`setSearch` + `flatRows`).
- `src/database/controller.ts` — `createDatabaseTreeController` (lifts cache/lazy/realtime
  out of `DatabaseTree.tsx`).
- `src/supabase/controller.ts` — `createSupabaseTreeController` (DB controller + lock).
- `docs/SPEC-controllers.md` — this file.

**Rewritten as thin views**
- `Tree.tsx` — `tree = props.tree ?? createTreeController(props)`; recursive render via
  `TreeBranch` reading `TreeContext` built from `tree._ctxState` + render props.
- `VirtualTree.tsx` — keeps virtualizer/measure/scroll; rows come from `tree.flatRows()`.
- `DatabaseTree.tsx` — drops the data logic; `tree = props.tree ?? createDatabaseTreeController(props)`;
  forwards `tree` to `<VirtualTree tree={...}/>`; keeps the loading-row `renderLabel` shim.
- `SupabaseTree.tsx` — `tree = props.tree ?? createSupabaseTreeController(props)`.

**Edited**
- `context.ts` — `TreeCtx` unchanged (still the row contract). Possibly split
  `TreeCtxState` (no render props) for `_ctxState`.
- barrels: `index.tsx`, `virtual.tsx`, `database.tsx`, `supabase.tsx` — export the
  `create*Controller` fns + controller types.
- `lock.ts` — unchanged (the Supabase controller composes it).
- `search.ts`, `storage.ts`, `tokens.ts`, `types.ts` — unchanged (pure).

**Compatibility shim**
- `state.ts` — re-export `createTreeController as createTreeState` for one minor version
  (deprecated) so nothing external breaks mid-migration. Remove next minor.

---

## 6. Migration phases (each: build → typecheck → demo verify → audit → commit)

**Phase 0 — this doc + decisions confirmed.** No code.

**Phase 1 — core controller.**
Extract `createTreeController` from `createTreeState`; move selection inside (signal,
seeded/mirrored from `selectedId` prop, fires `onSelect`); add `expandAll`/`collapseAll`/
`setSearch`/`flatRows`. Make `Tree` + `VirtualTree` consume it via the `tree ?? create`
pattern. Keep `state.ts` alias.
Verify: `/`, `?virtual` demos; question-editor `<Tree>` smoke. Commit.

**Phase 2 — database controller.**
Move `rootsQuery`/`childrenStore`/`assemble`/`fetchChildren`/`subscribe`/`patchLists`
into `createDatabaseTreeController`. `DatabaseTree.tsx` becomes a thin view over
`<VirtualTree tree={dbController}/>`. Expose `loadChildren`/`reloadChildren`/`isLoading`/
`subscribe`/`unsubscribe`. `toggle` triggers `loadChildren` internally.
Verify: `?database`, `?database2` (collab in-memory). Commit.

**Phase 3 — supabase controller.**
`createSupabaseTreeController` = `createDatabaseTreeController({source: supabaseSource(...)})`
+ `createSupabaseLock(...)`, exposing `acquireLock`/`releaseLock`/`releaseAllLocks`/
`refreshLock`/`heldId`. `SupabaseTree.tsx` thin. Migrate `SupabaseDemo` to build a
controller per column and pass `tree={...}`.
Verify: `?supabase` (expand/lazy/lock/realtime), `npm run audit` 15/15. Commit.

**Phase 4 — imperative-controls demo.**
New demo (or augment `?supabase`): buttons driving the controller — `Expand all`,
`Collapse all`, `Select first leaf`, `Lock random`, search box → `setSearch`. Proves the
external-control story. Commit.

**Phase 5 — docs + version.**
Update `AGENTS.md`/`README.md` with both API forms + the owner constraint; deprecate
`createTreeState`. Bump **0.12.0** (additive, backward compatible). Tag + release.

---

## 7. Risks & mitigations

- **Solid owner rule** — controllers must be created in a component/`createRoot`.
  Mitigate: `getOwner()` dev warning + docs + examples only ever create in component body.
- **Conditional create** (`props.tree ?? create…`) — fine in Solid (no rules-of-hooks);
  `props.tree` is static. Guard with an invariant if both `tree` and conflicting opts
  (e.g. `source`) are passed (warn, prefer `tree`).
- **Cleanup ownership** — controller subscriptions cleanup where the controller is
  created. If a user creates the controller in a parent and unmounts only the view, the
  subscription persists (correct, but document it; expose `unsubscribe`).
- **Regression surface** — the recursive `Tree` and the virtualizer measure dance are
  subtle. Mitigate: phase 1 changes the *source* of state but not the render path; verify
  the expand-spacing + search + persistence behaviors explicitly (they were hard-won).
- **question-editor consumer** — only uses `<Tree data .../>`; phase 1 preserves that
  exact API. Smoke-test before/after.
- **Double controller construction** — ensure `create…` runs once (component init), never
  in a render-tracked scope.

---

## 8. Testing checklist (per phase)

- [ ] `npm run typecheck` + `npm run build` clean (incl. all subpath `.d.ts`).
- [ ] `/` gallery: expand/collapse, persistence (reload), search prune + dim, dividers.
- [ ] `?virtual`: windowing (DOM ≪ total), expand-spacing stable, scroll.
- [ ] `?database` / `?database2`: lazy load + spinner, collab sync.
- [ ] `?supabase`: 3-level lazy expand, lock 🔒/👤 cross-session, ±$100 realtime.
- [ ] `npm run audit` → 15/15.
- [ ] imperative demo: `expandAll`/`collapseAll`/`select`/`acquireLock` from buttons.
- [ ] backward-compat: a `<Tree data onSelect selectedId/>` mount still works unchanged.

---

## 9. Decisions (LOCKED 2026-06-18)
1. **Selection scope:** SINGLE now (`selectedId`); multi-select later. ✅
2. **Selection model:** controller-owned signal + `selectedId` as an optional controlled
   input that wins when present. ✅
3. **Version:** pre-1.0 — bump **0.12.0** for the controller release. 1.0.0 is reserved
   for when the API has been tested in anger; until then the architecture stays malleable
   and may be rebuilt as needed. ✅
4. **`createTreeState`:** keep as a deprecated alias for one minor. ✅
5. **Cadence:** phase-by-phase — build a phase, verify (demo + audit), commit, pause for
   OK before the next. ✅
