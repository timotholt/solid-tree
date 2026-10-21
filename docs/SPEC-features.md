# Spec — Phase 7 features

Each feature is opt-in. The controller owns its state. `createTreeView` supplies the
input handling, and the styled views render it. Data stays the app's: features report
intent through callbacks, and the app (or the data source) updates the data.

## 7.1 Multi-select (landed in Phases 3–4)

- `selectionMode: "single" | "multiple"` (default single). In multiple mode the root has
  `aria-multiselectable`.
- Pointer: click selects one node. Ctrl/Cmd-click toggles. Shift-click selects the
  visible range from the anchor.
- Keyboard: Space/Enter select. Shift+↑/↓ extend. Ctrl/Cmd+A selects all visible rows.
- Controlled: `selectedIds` + `onSelectionChange(ids)`. Disabled and vetoed
  (`canSelect`) nodes are never swept into a range.

## 7.2 Inline rename

**API**
- `onRename(node, value) → boolean | void | Promise<boolean | void>`. Its presence
  enables renaming. Returning `false`, or rejecting, cancels.
- `canRename(node) → boolean`. Disabled nodes never rename.
- Controller: `editingId()`, `startEditing(id)`, `cancelEditing()`,
  `commitEditing(value)`, `pendingLabel(id)`.
- `renameOnBlur: "commit" | "cancel"`. Default "commit".

**Interaction**
- F2 on the focused row starts editing, as does `startEditing(id)`. The label becomes a
  text input with its text selected, `aria-label="Rename <label>"`.
- Enter commits, Escape cancels, and blur follows `renameOnBlur`. Focus returns to the
  row afterwards.
- An empty or unchanged value cancels without calling `onRename`.

**Optimistic display**
- On commit, the row shows the new label immediately as `pendingLabel` while
  `onRename` runs.
- When the result settles, the overlay is cleared. On success the data, which the app
  updated, shows the new label. On `false` or rejection the old label returns, and
  `onRenameError(node, error)` is called.
- A data update arriving mid-flight applies underneath the overlay, so once the overlay
  clears, the data (server) wins.

## 7.3 Checkboxes

**API**
- `checkable: boolean | ((node) => boolean)`.
- `checkMode: "cascade" | "strict"`. Default "cascade".
- Controlled `checkedIds` + `onCheckedChange(ids)`. Uncontrolled otherwise.
- Controller: `checkState(id) → "checked" | "unchecked" | "mixed"`, `toggleChecked(id)`,
  `checkedIds()`.

**Model** (core/checks.ts): an explicit set of checked ids.
- In cascade mode, checking a node checks its loaded descendants. A parent whose loaded
  children are all checked becomes checked. Unchecking anything unchecks its ancestors.
- A lazy node whose children are not loaded keeps its explicit value and is never
  "mixed". That keeps "everything under X" expressible for server-side bulk operations.
- The database tier tells the controller which nodes are loaded.

**Semantics**
- `aria-checked` sits on the treeitem itself, per the APG tree pattern; there is no
  nested checkbox control. A visual checkbox glyph renders in the leading slot,
  `aria-hidden`.
- Space toggles the check on checkable rows. Enter still selects and activates.
  Clicking the glyph toggles. Unchecked or mixed → checked, checked → unchecked. (Changed
  during Phase 8: mixed used to uncheck. Checking everything is the common tri-state
  convention.)
- Disabled nodes are not checkable.

## 7.4 Drag-and-drop and keyboard move

**API**
- `onMove(sources, target, position) → boolean | void | Promise<boolean | void>`. Its
  presence enables moving. `position` is "before", "after" or "inside".
- `canMove(sources, target, position) → boolean`: policy. Structural impossibilities
  (onto itself, into its own subtree, inside a separator) are always rejected by
  core `canMove`.
- `optimisticMoves`: default true. The tree shows the move immediately (core
  `applyMove` over the current data) until the `onMove` result settles, then the data
  wins. Same rule as rename.
- Database tier: when the app gives no `onMove` and the source has `move(...)`, that is
  used.
- `moveNodes(data, sources, target, position)`: a helper for in-memory apps to produce
  the new data.

**Pointer**
- Pointer events, not HTML5 drag-and-drop, which is unreliable on touch and gives no
  control over the preview.
- The drag starts after 5 px of movement (mouse/pen), or after a 400 ms long press
  (touch).
- Pointer capture stays on the source row. The row handles `touch-action: none` while
  dragging.
- The target is the row under the pointer (`elementFromPoint` → closest
  `[data-tree-id]`). It is recomputed on every pointermove **and** on scroll, because
  auto-scroll moves rows under a still pointer, and virtual rows are recycled.
- Position by vertical zone inside the target row:
  - top 25 % → before;
  - bottom 25 % → after;
  - middle → inside.
  A target where moving inside is invalid uses before/after halves.
- An invalid drop shows no indicator, and releasing does nothing.
- Indicator: `data-drop="before|after|inside"` on the target row, styled by theme.css.
  The dragged rows get `data-dragging`.
- Hovering "inside" a collapsed parent expands it after 600 ms. Near the top or bottom
  20 px of the scroll container, it auto-scrolls.
- In multiple mode, dragging a selected row moves all selected rows; otherwise the
  dragged row moves alone.
- Escape cancels a drag in progress.

**Keyboard move** (focused row, or the selection):

| Key | Move |
|---|---|
| Ctrl+Shift+↑ | before the previous sibling |
| Ctrl+Shift+↓ | after the next sibling |
| Ctrl+Shift+← | out of the parent (after it) |
| Ctrl+Shift+→ | into the previous sibling (as its last child) |

Each move is announced in the live region, for example "Moved Apple before Banana".

**Non-goals:** external drops (OS files, other apps), drag previews beyond the row
itself, and cross-tree drag.

## Tests per feature

- Core reducers: property tests already exist for selection, checks and moves.
- Controller: unit tests (state, callbacks, optimistic overlay, rollback).
- DOM: keyboard matrix and ARIA.
- Browser: pointer drag including touch emulation, auto-scroll and virtual rows, plus
  axe on each feature's states.
