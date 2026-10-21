# Accessibility

solid-tree implements the [WAI-ARIA tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/).

## What is verified automatically

`tests/browser/a11y.test.tsx` runs **axe-core** in a real browser (Chromium on every PR,
Firefox and WebKit nightly) on:

- `<Tree>`: collapsed, expanded and selected rows; separators, counts, icons, disabled and
  action rows; an actions slot; prune and dim search; no matches; multiple selection; RTL.
- `<VirtualTree>`: a large expanded tree before and after scrolling.
- `<DatabaseTree>`: roots loading, loaded, a loading branch (`aria-busy`), an error
  branch.

Each must have **zero** violations. Keyboard behavior is covered by unit and DOM tests
(`tests/unit/core/navigation.test.ts`, `tests/dom/*.test.tsx`).

## Semantics

| Feature | How |
|---|---|
| Roles | `tree` on the root, `treeitem` per row. Rows are rendered flat and described by `aria-level`, `aria-posinset` and `aria-setsize`, which a virtualized list needs because unrendered rows cannot be counted. |
| State | `aria-expanded` (parents only), `aria-selected`, `aria-disabled`, `aria-busy` on a branch while it loads, `aria-multiselectable` in multiple mode. |
| Focus | Roving tabindex: one Tab stop. It remembers the focused row. If that row is scrolled out of a virtual window, the tree root becomes the Tab stop and hands focus back. Clicking a visible row never scrolls. |
| Search | A polite live region announces "N matches" / "No matches". |
| Contrast | Default dimmed and count text meet 4.5:1 on white. |
| Direction | `dir="rtl"` swaps ArrowLeft and ArrowRight. |

## Keyboard

| Key | Action |
|---|---|
| ↓ / ↑ | Next / previous visible row |
| → | Expand; on an expanded row, go to its first child |
| ← | Collapse; on a collapsed row or leaf, go to its parent |
| Home / End | First / last visible row |
| `*` | Expand all sibling parents |
| Enter | Select and activate (`onActivate`) |
| Space | Select. On checkable rows it toggles the checkbox instead |
| Type a letter / word | Jump to the next row whose label starts with it (type-ahead) |
| Ctrl/Cmd+A | Select all (multiple mode) |
| Shift+↓ / Shift+↑ | Extend the selection (multiple mode) |
| Shift+click / Ctrl/Cmd+click | Range / toggle selection (multiple mode) |
| Double-click | Activate |
| F2 | Rename (when `onRename` is set). Enter commits, Escape cancels |
| Ctrl+Shift+↑ / ↓ | Move before the previous / after the next sibling (when `onMove` is set) |
| Ctrl+Shift+← / → | Move out of the parent / into the previous sibling |
| Escape (while dragging) | Cancel the drag |

Disabled nodes stay focusable, so users can discover them, but they cannot be selected or
activated. `skipDisabled` in the core navigation skips them entirely.

## Rename

While a row is being renamed, its text input lives inside the treeitem. That is a
transient "nested interactive" state, and the axe check for feature states disables only
that rule. The input is labelled "Rename <label>", and focus returns to the row afterwards.

## Drag-and-drop

Every pointer move has a keyboard equivalent (Ctrl+Shift+Arrows), and each move is
announced in the live region.

## The actions slot

`renderActionNode` renders inside each treeitem, because a `tree` may only contain
treeitems. It is `aria-hidden`, and its controls are removed from the tab order. **Treat
actions as pointer shortcuts.** Offer the same commands by keyboard, for example in
`onActivate`, an `onKeyDown` handler, or a context menu. Controls nested inside a treeitem
are not reliably reachable with assistive technology.

## Manual checks (per release)

Automated checks do not replace screen-reader testing. Before each release:

- [ ] VoiceOver + Safari (macOS): navigation, expand/collapse, selection, search
  announcements, a lazy branch loading.
- [ ] NVDA + Firefox (Windows): the same.
- [ ] Keyboard only: every action reachable, focus always visible.

**Status:** not yet performed for 1.0. Record results here, with date and versions.
