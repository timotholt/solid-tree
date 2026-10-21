# Theming

Every visual is a CSS custom property. Override it on `.solid-tree-container` or on any
ancestor; custom properties inherit, so there are no specificity fights.

```css
.my-sidebar { --tree-font-size: 14px; --tree-row-active-bg: #dbeafe; --tree-indent-step: 1.25em; }
```

`--tree-font-size` is the scale anchor. Spacing is in `em`, so changing it resizes the
whole tree proportionally.

## Optional stylesheet

`import "@timotholt/solid-tree/theme.css"` adds the cosmetics: row padding, hover and
selection backgrounds, the focus ring, search highlight, error styling, the compact
density preset (`data-density="compact"` on any ancestor) and dark mode
(`prefers-color-scheme`, or `data-theme="dark"|"light"` on any ancestor). Without it the
tree still lays out and works.

## State hooks for your own CSS

`.solid-tree-row` (the row) and `.solid-tree-item` (the treeitem inside it) carry
`data-selected`, `data-depth`, `data-variant`, `data-dimmed`, `data-disabled`,
`data-has-children`, and while dragging `data-drop="before|after|inside"` and
`data-dragging`. The container gets `data-searching` while a query is active.

## Multi-line rows

Set `--tree-label-white-space: normal` and `--tree-row-align-items: flex-start`, then
render stacked content with `renderLabel`.

## Tokens

The table below is generated from `src/view/tokens.ts`, and a test fails if they
disagree. To regenerate it, run `UPDATE_DOCS=1 npx vitest run --project unit tests/unit/docs.test.ts`.

<!-- tokens:start -->
| Token | Default |
|---|---|
| `--tree-font-size` | `12px` |
| `--tree-indent-base` | `1em` |
| `--tree-indent-step` | `1em` |
| `--tree-group-weight` | `700` |
| `--tree-count-opacity` | `0.6` |
| `--tree-count-gap` | `0.33em` |
| `--tree-count-weight` | `400` |
| `--tree-icon-left-gap` | `0` |
| `--tree-icon-right-gap` | `0.5em` |
| `--tree-icon-right-size` | `0.92em` |
| `--tree-chevron-gap` | `0.33em` |
| `--tree-action-gap` | `0.67em` |
| `--tree-action-opacity` | `0.6` |
| `--tree-dim-opacity` | `0.55` |
| `--tree-divider-color` | `var(--border-subtle)` |
| `--tree-divider-margin` | `8px` |
| `--tree-divider-height` | `1px` |
| `--tree-spacer-width` | `1.33em` |
| `--tree-check-gap` | `0.33em` |
| `--tree-drop-color` | `Highlight` |
| `--tree-user-select` | `none` |
| `--tree-row-align-items` | `center` |
| `--tree-label-white-space` | `nowrap` |
<!-- tokens:end -->

theme.css adds `--tree-row-pad-y`, `--tree-row-pad-x`, `--tree-row-radius`,
`--tree-row-color`, `--tree-row-hover-bg`, `--tree-row-active-bg`, `--tree-mark-bg`,
`--tree-mark-color`, `--tree-focus-color`, `--tree-focus-width` and `--tree-error-color`.
