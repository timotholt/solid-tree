# Contracts frozen at the end of Phase 3

These interfaces are fixed before Phases 4, 5 and 6 run in parallel (PLAN §4 P3). Changing
one later means updating this file in the same commit and telling every phase that
consumes it.

## 1. Controller options (`src/controller/options.ts`)

- `CoreControllerOptions` and `CORE_OPTION_KEYS` are the only declaration of the option
  set. A type test (`tests/dom/controller-state.test.ts`) fails if they drift apart.
- **Controlled iff provided, decided at creation.** `selectedId`, `selectedIds`,
  `expandedIds` and `searchQuery` are controlled when their key is present on the
  options/props object. `null` means "controlled, nothing selected". A controlled value
  that later becomes `undefined` stays controlled and logs a dev warning.
- **Every option is live.** Options are read where they are used. Adapters forward them
  as getters (`pickCore`, `forward`), never by spreading. Spreading Solid props evaluates
  them once and breaks both reactivity and key presence.
- Values or accessors: `data`, `selectedId`, `selectedIds`, `expandedIds` and
  `searchQuery` accept a plain value or an accessor.

## 2. Rows (`FlatRow`, from `controller.flatRows()`)

```ts
interface FlatRow {
  id: string;
  kind: "node" | "separator" | "placeholder";
  placeholder?: "loading" | "error";   // only for kind "placeholder"
  node: TreeNodeData;                   // placeholder rows: a synthesized stand-in (type PLACEHOLDER_TYPE)
  depth: number;                        // 0-based
  level: number;                        // 1-based aria-level
  posinset: number;                     // among visible non-separator siblings; 0 for separators/placeholders
  setsize: number;                      // 0 for separators/placeholders
  hasChildren: boolean;                 // includes lazy branches (isExpandable)
  expanded: boolean;                    // effective (user state + search + ephemeral layer)
  parentId: string | null;
  navigable: boolean;                   // kind === "node"
}
```

- Views render by `kind`. Only `kind: "node"` rows are treeitems, focusable or
  selectable.
- `flatRows()` is memoized. The same array comes back until something it depends on
  changes.

## 3. Lazy branches and placeholders (Phase 5 implements, Phase 4 renders)

The database tier feeds the core controller two hooks (`LazyHooks`):

- `isExpandable(id)`: the node may have children that are not loaded yet. It shows a
  chevron and can be expanded.
- `placeholder(id)`: for an expanded lazy node with no loaded children, return
  `"loading"`, `"error"` or `null`. The controller emits a placeholder row at
  `placeholderId(parentId)` (`"<parentId>::placeholder"`).
- `lazy: true`: restored expanded ids that are not in the data yet wait for their nodes
  (and fire `onToggle(id, true)` when they appear) instead of being pruned.

Phase 5 stops injecting "Loading…" nodes into the data. It exposes `loading(id)`,
`error(id)` and `retry(id)` on the database controller and drives `placeholder` from
them. Phase 4 renders placeholder rows: loading as a busy row (`aria-busy` on the
parent), error with a retry action.

## 4. Realtime changes (`TreeChange`)

Added for Phase 5 and Phase 6:

```ts
| { type: "move"; id: string; parentId: string | null; index?: number }
| { type: "update"; node: TreeNodeData; parentId?: string | null }  // parentId: when known
```

Phase 5's controller detects a move by comparing `parentId` with `index.parentOf(id)`. It
never needs Supabase's `old` row. Phase 6's `supabaseSource` emits `parentId` on UPDATE
(from the parent column).

## 5. Activation, scrolling, selection events

- `onActivate(node)` runs on Enter and, from Phase 4, on double-click. It is separate
  from selection.
- `onSelect(node)`: the user selected a node (the primary id of select, toggle or
  range).
- `onSelectionChange(ids)`: every change, including deselect and nodes removed from the
  data.
- `controller.scrollToId(id)` reveals ancestors, then calls the scroller the view
  registered through `_registerScroller`. Phase 4 registers it in both views.

## 6. Core (`src/core/`)

Pure, framework-free, and covered by property tests. Its exports are part of the
`/headless` surface that Phase 4 publishes: `buildIndex`, `searchView`, `flatten`,
`resolveKey`, `typeahead`, `reduceSelection`, `checkStateOf`/`toggleCheck`,
`canMove`/`applyMove`.
