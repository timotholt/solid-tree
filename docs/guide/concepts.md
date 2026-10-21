# Concepts

## Controller and view

Every tier has a **controller** that owns state and actions, and a **view** that
renders it.

```tsx
const tree = createTreeController({ data: () => data() });   // inside a component
tree.expandAll(); tree.select("apple"); tree.scrollToId("deep-node");
return <Tree tree={tree} />;
```

Or skip the controller and pass props: the view builds one internally.
`<Tree data={...} onSelect={...} />` is the same thing. Passing both `tree` and
controller props logs a dev warning, because the props would be ignored.

Controllers must be created inside a component body or `createRoot`, since they create
signals and effects.

## Controlled vs uncontrolled

`selectedId`, `selectedIds`, `expandedIds`, `checkedIds` and `searchQuery` are
**controlled when the prop is passed**. That is decided once, when the tree is created.
Pass `null` for "controlled, nothing selected". When a prop is controlled, the tree
reports changes (`onSelect`, `onSelectionChange`, `onExpandedChange`,
`onCheckedChange`) and the app applies them. When a prop is absent, the tree keeps its
own state.

Every option is live: change `matcher`, `filterMode`, `rowClickPolicy` or `canSelect`
at any time and the tree follows.

## The tiers

| Tier | Component | Controller | For |
|---|---|---|---|
| `.` | `<Tree>` | `createTreeController` | in-memory data, any size up to a few thousand visible rows |
| `/virtual` | `<VirtualTree>` | `createTreeController` | large in-memory data (100k+ nodes), windowed |
| `/database` | `<DatabaseTree>` | `createDatabaseTreeController` | async sources: lazy children, caching, realtime, server search |
| `/supabase` | `<SupabaseTree>` | `createSupabaseTreeController` | a Supabase table, plus collaborative record locking |
| `/headless` | your markup | `createTreeController` + `createTreeView` | fully custom rendering with the same behavior |

Each tier wraps the one below it, so everything about the core applies to all of them.

## Data

```ts
interface TreeNodeData<P = any> {
  id: string;                 // unique across the whole tree
  label: string;
  type: string;               // your kind tag; the tree never interprets it
  children?: TreeNodeData<P>[];
  payload?: P;                // your data
  disabled?: boolean;         // focusable, not selectable
  kind?: "separator";         // or isDivider: true
  iconLeft?, iconRight?, count?, status?, variant?: "action";
}
```

Duplicate ids throw in development, naming the id. In production the duplicate is
skipped and logged, so bad data cannot take the tree down.

## Rows

The views render `controller.flatRows()`: the visible rows in order, each with `id`,
`kind` (`node`, `separator` or `placeholder`), `level`, `posinset`, `setsize`,
`expanded`, `hasChildren` and `parentId`. Placeholder rows (loading or error under a
lazy branch) are synthesized, never data, so they are never selectable.

## Search

`searchQuery` (or `tree.setSearch`) filters the tree:

- **prune** (the default) shows matches, their ancestors, and the contents of matched
  nodes;
- **dim** shows everything and dims non-matches.

Search opens only the ancestors of matches. Expanding or collapsing while searching is
temporary: it is never saved, and it resets when the search ends.

## Features

Multi-select, inline rename, checkboxes, and drag-and-drop with keyboard moves are all
opt-in. See [SPEC-features](../SPEC-features.md) and the gallery.
