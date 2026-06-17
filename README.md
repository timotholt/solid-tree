# @timotholt/tree

A small, themeable **SolidJS** tree-view component. Extracted to be reused across
apps — "build once, use many".

Features: expand/collapse (optionally persisted to `localStorage`), selection with
auto-expand-to-selection, left/right icons, counts, dividers, depth indentation,
per-node action slots, custom label rendering, and search/filter (prune or dim,
pluggable matcher, built-in highlight).

`solid-js` is a **peer dependency** — the package ships its raw source under the
`solid` export condition so your app's `vite-plugin-solid` compiles it, keeping a
single Solid instance.

## Install (git dependency)

No registry needed — install straight from the tagged git repo:

```jsonc
// package.json
{
  "dependencies": {
    "@timotholt/tree": "github:timotholt/solid-tree#v0.1.0"
  }
}
```

Then `npm install`. Consumers must use Vite + `vite-plugin-solid` (the standard
SolidJS setup) so the `solid` export condition resolves and the JSX compiles.

> **Alt distribution:** publish to npm / a private registry later with
> `npm publish` — the `exports` map already exposes a compiled `import` entry
> (`dist/index.js`) + types for non-Solid-aware bundlers.

## Theme (required CSS vars)

The component references two CSS custom properties. Either define them yourself:

```css
:root {
  --text-muted: #8a8f98;        /* chevron color */
  --border-subtle: rgba(0,0,0,0.12); /* divider color */
}
```

…or import the shipped defaults (also styles row hover/active + the action slot):

```ts
import "@timotholt/tree/theme.css";
```

`theme.css` exposes overridable vars: `--tree-row-hover-bg`, `--tree-row-active-bg`,
`--tree-row-radius`, `--tree-row-color`.

## Usage

```tsx
import { createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/tree";
import "@timotholt/tree/theme.css";

const data: TreeNodeData[] = [
  {
    id: "fruit", label: "Fruit", type: "group", iconLeft: "🍎",
    children: [
      { id: "apple", label: "Apple", type: "item", count: 3 },
      { id: "banana", label: "Banana", type: "item", iconRight: "⭐", status: "new" },
    ],
  },
  { id: "div", label: "", type: "divider", isDivider: true },
  { id: "add", label: "+ Add", type: "add", variant: "action" }, // centered, dimmed, no chevron
];

function Sidebar() {
  const [sel, setSel] = createSignal<string | null>("apple");
  return (
    <Tree
      data={data}
      selectedId={sel()}
      storageKey="sidebar"
      onSelect={(n) => setSel(n.id)}
      renderActionNode={(n) =>
        n.status === "new" ? <span class="badge">new</span> : null
      }
    />
  );
}
```

### Badges / actions via `renderActionNode`

`renderActionNode(node)` renders into a right-aligned slot on each row. Clicks
inside it don't trigger row selection (the slot stops propagation). Return
`null` for rows that shouldn't show one:

```tsx
renderActionNode={(node) => (
  <>
    {node.count != null && <span class="badge">{node.count}</span>}
    <button onClick={() => remove(node.id)}>✕</button>
  </>
)}
```

## API

### `TreeNodeData`

| field          | type                          | notes                                                      |
| -------------- | ----------------------------- | ---------------------------------------------------------- |
| `id`           | `string`                      | unique; used for selection + persisted expand state        |
| `label`        | `string`                      | shown unless `renderLabel` overrides                       |
| `type`         | `string`                      | app-defined kind, handed back in `onSelect`; not interpreted |
| `iconLeft?`    | `string \| JSX.Element`       | leading icon                                               |
| `iconRight?`   | `string \| JSX.Element`       | trailing icon                                              |
| `count?`       | `number`                      | shown as `(n)` after the label                             |
| `status?`      | `string`                      | free-form; useful inside `renderActionNode`                |
| `isDivider?`   | `boolean`                     | renders a horizontal rule instead of a row                 |
| `variant?`     | `"default" \| "action"`       | `"action"` = centered, dimmed, no chevron/indent           |
| `children?`    | `TreeNodeData[]`              | nested nodes                                               |
| `payload?`     | `any`                         | arbitrary data carried on the node                         |

### `<Tree>` props

| prop               | type                                  | default  | notes                                            |
| ------------------ | ------------------------------------- | -------- | ------------------------------------------------ |
| `data`             | `TreeNodeData[]`                      | —        | tree to render                                   |
| `selectedId?`      | `string \| null`                      | —        | selected node id; ancestors auto-expand          |
| `storageKey?`      | `string`                              | —        | **opt-in** persistence. Set a per-tree key to remember expand state across reloads; omit for in-memory only (multiple unkeyed trees won't clobber) |
| `storagePrefix?`   | `string`                              | `"tree"` | `localStorage` key = `${storagePrefix}-${storageKey}` |
| `onSelect`         | `(node) => void`                      | —        | row selected                                     |
| `onToggle?`        | `(id, expanded) => void`              | —        | expand/collapse fired (incl. restored on mount)  |
| `renderActionNode?`| `(node) => JSX.Element`               | —        | right-side slot per row                           |
| `renderLabel?`     | `(node) => JSX.Element`               | —        | custom label renderer                            |
| `basePadding?`     | `number`                              | `12`     | left padding (px) at depth 0                     |
| `indentStep?`      | `number`                              | `12`     | added px per depth level                         |
| `searchQuery?`     | `string`                              | —        | active filter; empty/undefined = no filtering    |
| `matcher?`         | `(node, q: string) => boolean`        | label substring | hit policy (see Search below)             |
| `filterMode?`      | `"prune" \| "dim"`                    | `"prune"`| prune drops non-matches; dim fades them           |
| `noMatchesLabel?`  | `string`                              | `"No matches"` | shown (prune) when a query yields nothing   |

Also exported: `Chevron` (the ▶/▼ toggle), `storage` (the localStorage helper), and the `TreeMatcher` type.

## Search & filtering

Set `searchQuery`. Tree owns the **structure** (keeps matches + their ancestor
path, force-expands to reveal them *without* touching saved expand state, restores
on clear); you own the **policy** via `matcher`.

```tsx
const [q, setQ] = createSignal("");
<input value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
<Tree data={data} searchQuery={q()} ... />   // default: case-insensitive label substring
```

- **`matcher`** is the comparator seam — default tests `label`. Override to fuzzy
  match, span fields, or read `payload` (which Tree never inspects itself):
  ```tsx
  matcher={(n, q) =>
    n.label.toLowerCase().includes(q.toLowerCase()) ||
    n.payload?.code?.toLowerCase().includes(q.toLowerCase())
  }
  ```
- **`filterMode`** — `"prune"` (default) removes non-matches; `"dim"` keeps the
  whole tree and lowers opacity on non-matches.
- **Highlight** — the matched substring is wrapped in `<mark class="solid-tree-mark">`
  automatically on the default-matcher path. With a custom `matcher` (returns a
  bool, so Tree can't know *what* matched) or a `renderLabel`, you own highlighting.
- Debounce and the `<input>` itself stay in your component.
- **Note:** prune-search assumes the subtree is loaded — it can't match nodes you
  haven't supplied (e.g. lazy/async children).

## Cutting a new version

```bash
# bump "version" in package.json, then:
npm run build          # sanity check: dist + types emit clean
git commit -am "release: vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

Consumers bump the `#vX.Y.Z` ref in their `package.json` and re-`npm install`.

## Develop

```bash
npm install
npm run build          # vite lib build + tsc .d.ts
cd examples && npm install && npm run dev   # live demo gallery on :5180
```

## License

MIT
