# Migrating from 0.16 and earlier

Most apps need no changes. Check each item below.

## 1. Uncontrolled selection now works

Before, `<Tree data onSelect>` without `selectedId` never showed a selection, so apps
passed `selectedId` to work around it. That still works: passing `selectedId` makes the
selection controlled. If you passed `selectedId={undefined}` meaning "let the tree
decide", remove the prop. A passed prop is controlled, even when its value is
`undefined`.

## 2. Collapsing no longer moves the selection

Collapsing an ancestor of the selected node used to select that ancestor and fire
`onSelect`. To keep that behavior:

```tsx
<Tree selectAncestorOnCollapse … />
```

## 3. `TreeController.selectedId()` returns `null`, not `undefined`

Comparisons like `=== undefined` become `=== null`, or just `!id`.

## 4. Deselect is reported through `onSelectionChange`

`onSelect(node)` still fires when the user selects. `deselect()` (and nodes removed from
the data) now call `onSelectionChange(ids)`.

## 5. Loading rows are not nodes any more

The database tier used to inject `{ id: "<parent>::__loading", type: LOADING_TYPE }` nodes.
Now loading and error rows are synthesized rows: `kind: "placeholder"`, id
`"<parent>::placeholder"`, node type `PLACEHOLDER_TYPE` (`LOADING_TYPE` is an alias).
They are never selectable. A custom `renderLabel` that special-cased `LOADING_TYPE`
keeps working.

## 6. Markup

Rows are flat: a `.solid-tree-row` (`role="none"`) holds a `.solid-tree-item` (the
treeitem). The old nested DOM by depth is gone; ARIA attributes describe the hierarchy.
CSS selecting `.solid-tree-row[data-selected]` and the like still works, because the
state attributes are on both elements. CSS relying on DOM nesting (`.parent .child`)
must switch to `[data-depth]`.

## 7. The actions slot is pointer-only

`renderActionNode` content is `aria-hidden` and out of the tab order. Make sure every
action is also reachable by keyboard: `onActivate`, a key handler, or a context menu.
See [Accessibility](../ACCESSIBILITY.md).

## 8. Look

The default `--tree-count-opacity` is 0.6 (was 0.5) and `--tree-dim-opacity` is 0.55
(was 0.38), for WCAG AA contrast. Set the old values on your container to restore them.

## 9. Supabase

- The heartbeat now runs even while the window is unfocused. Restore the old behavior
  with `heartbeatPolicy="focused"`.
- Locks are released on unmount and page hide. Opt out with `releaseOnDispose={false}`.
- The demo SQL (`scratch_lock_demo`) is replaced by the table-agnostic installer:
  `select solid_tree.install_lock('public.your_table')`.

## 10. Peers

`solid-js` ≥ 1.9.16, `@tanstack/solid-virtual` ≥ 3.13.32, `@tanstack/solid-query` ≥ 5.30,
`@supabase/supabase-js` ≥ 2.45.
