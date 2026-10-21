# @timotholt/solid-tree — agent guide

SolidJS tree view. This file is the complete usage contract. Read it, then use the
component without guessing. Human docs: docs/guide/.

## Install (do ALL of these; step 3 fails silently if skipped)

1. Dependency: `npm i @timotholt/solid-tree`. Before the npm release, use git:
   `"@timotholt/solid-tree": "github:timotholt/solid-tree#semver:^0.16.0"`.
2. Peers, only for the tiers you import:
   - `/virtual` → `@tanstack/solid-virtual` ≥ 3.13.32
   - `/database` → + `@tanstack/solid-query` ≥ 5.30
   - `/supabase` → + `@supabase/supabase-js` ≥ 2.45
   - `solid-js` ≥ 1.9.16 always.
3. `vite.config.ts` (REQUIRED):
   ```ts
   resolve: { dedupe: ["solid-js", "@tanstack/solid-virtual", "@tanstack/solid-query"] },
   optimizeDeps: { exclude: ["@timotholt/solid-tree"] },
   ```
   Symptom when missing: a blank tree in `vite build` (two Solid instances).
4. Optional: `import "@timotholt/solid-tree/theme.css"` (hover, selection, focus ring,
   dark/compact presets).

## Imports

| Import | Exports |
|---|---|
| `@timotholt/solid-tree` | `Tree`, `createTreeController`, `moveNodes`, `Chevron`, types |
| `@timotholt/solid-tree/virtual` | `VirtualTree` (+ the above) |
| `@timotholt/solid-tree/database` | `DatabaseTree`, `createDatabaseTreeController`, `PLACEHOLDER_TYPE` |
| `@timotholt/solid-tree/supabase` | `SupabaseTree`, `createSupabaseTreeController`, `supabaseSource`, `createSupabaseLock` |
| `@timotholt/solid-tree/headless` | `createTreeView`, `createTreeController`, the core (`buildIndex`, `flatten`, `searchView`, `resolveKey`, `reduceSelection`, `toggleCheck`, `applyMove`…) |
| `@timotholt/solid-tree/testing` | `createMemorySource`, `runTreeSourceContract`, `CONTRACT_TREE` |

## Minimal example

```tsx
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
const data: TreeNodeData[] = [{ id: "a", label: "Group A", type: "group", children: [{ id: "a1", label: "Item 1", type: "item" }] }];
<Tree data={data} ariaLabel="Sidebar" onSelect={(n) => console.log(n.id)} />
```

## TreeNodeData

```ts
{
  id: string;          // unique across the whole tree (duplicates: throw in dev, skipped in prod)
  label: string;
  type: string;        // YOUR kind tag; never interpreted
  children?: TreeNodeData[];
  payload?: any;       // your data. Database tier: payload.leaf === true = no chevron
  disabled?: boolean;  // focusable, not selectable/activatable/renamable/checkable/movable
  kind?: "separator";  // or isDivider: true → a divider row
  iconLeft?: string | JSX.Element; iconRight?: string | JSX.Element;
  count?: number;      // "(n)" after the label
  status?: string;
  variant?: "default" | "action";  // "action": centered, dimmed (e.g. "+ Add")
}
```

## Props / controller options (identical names; all live: changing one takes effect)

**Controlled iff passed** (decided once): `selectedId`, `selectedIds`, `expandedIds`,
`checkedIds`, `searchQuery`. `null` = controlled, nothing selected. Accept a value or an
accessor.

| Option | Meaning |
|---|---|
| `data` | the tree (array or accessor). Not used with `tree=`/database tiers |
| `selectionMode` | `"single"` (default) or `"multiple"` |
| `onSelect(node)` | the user selected a node |
| `onSelectionChange(ids)` | any selection change, including deselect and removals |
| `canSelect(node)` | veto |
| `onActivate(node)` | Enter / double-click |
| `onExpandedChange(ids)`, `onToggle(id, open)` | expansion events |
| `storageKey`, `storagePrefix` | persist expansion in localStorage under `${prefix ?? "tree"}-${key}` |
| `persistence` | custom `{ load(): string[] \| null; save(ids) }` |
| `revealSelection` | expand the selection's ancestors (default true) |
| `selectAncestorOnCollapse` | default false |
| `matcher(node, q)`, `filterMode` (`"prune"`/`"dim"`) | search |
| `onRename(node, value)`, `canRename`, `renameOnBlur`, `onRenameError` | inline rename (F2). Update your data in onRename |
| `checkable` (bool or predicate), `checkMode` (`"cascade"`/`"strict"`), `onCheckedChange` | checkboxes |
| `onMove(sources, target, "before"/"after"/"inside")`, `canMove`, `optimisticMoves` | drag-and-drop + Ctrl+Shift+Arrows. In-memory: `setData(moveNodes(data(), s, t, p))` |

View-only props: `ariaLabel` (always set one) / `ariaLabelledBy`, `rowClickPolicy`
(`"finder"` default: click selects and toggles; `"select-only"`), `dir="rtl"`,
`renderLabel(node)`, `renderLeading(row)`, `renderActionNode(node)` (aria-hidden,
pointer-only; give keyboard equivalents), `noMatchesLabel`, `basePadding`,
`indentStep`, `tree` (an external controller; other controller props are then
ignored, with a dev warning).

`<VirtualTree>` adds `estimateSize`, `overscan`, `class`, `viewportStyle` (give it a
bounded height) and `onRangeChange`.

## Controller API (`createTreeController(opts)`, call inside a component or createRoot)

Reads: `flatRows()` (visible rows: `id, kind, node, level, posinset, setsize, expanded,
hasChildren, parentId`), `index()`, `selectedId()`, `selectedIds()`, `expandedIds()`,
`isExpanded(id)`, `query()`, `searching()`, `matchCount()`, `noMatches()`, `checkedIds()`,
`checkState(id)`, `editingId()`.

Actions: `expand/collapse/toggle(id)`, `expandAll()`, `collapseAll()`, `select(id)`,
`toggleSelected(id)`, `selectRange(id)`, `selectAll()`, `deselect()`, `activate(id)`,
`setSearch(q)`, `scrollToId(id)`, `startEditing(id)`, `commitEditing(v)`,
`cancelEditing()`, `toggleChecked(id)`, `move(sources, target, position)`.

Database controller adds: `loadChildren`, `reloadChildren`, `refetchRoots`,
`loading(id|null)`, `error(id|null)`, `retry(id|null)`, `subscribe`, `unsubscribe`.
Supabase adds: `heldId()`, `acquireLock`, `releaseLock`, `releaseAllLocks`,
`refreshLock`.

## Data sources (`<DatabaseTree source={…}>`)

```ts
interface TreeSource {
  getRoots(): Promise<TreeNodeData[]>;
  getChildren?(node): Promise<TreeNodeData[]>;
  subscribe?(onChange: (c: TreeChange) => void): () => void;
  search?(q): Promise<TreeNodeData[]>; getAncestors?(id): Promise<string[]>;
  compare?(a, b): number; move?(sources, target, position): Promise<boolean | void>;
}
// TreeChange: insert {parentId,node} | update {node,parentId?} | move {id,parentId,index?} | remove {id} | reload
```

Verify adapters with `runTreeSourceContract(name, (tree) => ({ source }), { describe, it, expect })`.

## Keyboard (built in)

Arrows, Home/End, `*`, type-ahead, Enter (select + activate), Space (select; toggles
the check on checkable rows), F2 (rename), Ctrl/Cmd+A, Shift+Arrows (extend),
Ctrl+Shift+Arrows (move), Escape (cancel a drag or rename). Full map in
docs/ACCESSIBILITY.md.

## Gotchas

- Always pass `ariaLabel` (or `ariaLabelledBy`).
- Controllers must be created inside a reactive owner.
- Do not spread Solid props into options (`{...props}` freezes them). Pass the props
  object, or use `mergeProps`.
- `<VirtualTree>` needs a bounded height.
- Rename and move callbacks must update YOUR data (or source). The optimistic display is
  cleared when they settle.
