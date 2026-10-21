# @timotholt/solid-tree

An accessible, fast, fully featured tree view for **SolidJS**: from a 10-line sidebar to
a 100,000-node virtualized explorer, a lazy-loading remote tree with realtime updates, or
fully custom markup through a headless API.

- **Accessible:** the complete WAI-ARIA tree pattern (roving focus, type-ahead, `*`,
  RTL, set sizes for virtual lists, live search announcements), checked by axe in a real
  browser.
- **Fast:** a normalized index; 100k nodes index in ~10 ms and search in ~30 ms. The
  windowed `<VirtualTree>` is built on TanStack Virtual.
- **Complete:** search (prune/dim), single and multi-select, inline rename, tri-state
  checkboxes, drag-and-drop with keyboard moves, persistence, controlled or uncontrolled
  everything.
- **Async and realtime:** `<DatabaseTree>` over any backend (lazy children, caching,
  realtime patches, server search, error/retry). `<SupabaseTree>` adds collaborative
  record locking.
- **Headless:** `createTreeView` gives you ARIA, focus and input as prop getters for any
  markup.
- **Tested:** about 340 tests (unit, property, DOM, real browser, SQL, packaging). Every
  fixed bug has a regression test.

```tsx
import { Tree } from "@timotholt/solid-tree";
import "@timotholt/solid-tree/theme.css";

<Tree
  ariaLabel="Files"
  data={[{ id: "src", label: "src", type: "dir", children: [{ id: "a", label: "index.ts", type: "file" }] }]}
  onSelect={(node) => console.log(node.id)}
/>
```

## Install

```bash
npm i @timotholt/solid-tree   # + peers for the tiers you use (see Getting started)
```

**Required with Vite:** `resolve.dedupe: ["solid-js", …]` and
`optimizeDeps.exclude: ["@timotholt/solid-tree"]`. Without them a production build can
render a blank tree. See [Getting started](docs/guide/getting-started.md).

## Docs

| | |
|---|---|
| [Getting started](docs/guide/getting-started.md) | install, Vite config, first tree |
| [Concepts](docs/guide/concepts.md) | controller vs view, controlled inputs, tiers, rows, search |
| [Data sources](docs/guide/data-sources.md) | async/realtime, errors, caching, writing and testing an adapter |
| [Theming](docs/guide/theming.md) | tokens, theme.css, dark/compact, state hooks |
| [Accessibility](docs/ACCESSIBILITY.md) | semantics, keyboard map, what is verified |
| [Performance](docs/guide/performance.md) | numbers and guidance |
| [Testing](docs/guide/testing.md) | testing your tree; the contract suite |
| [Migrating from 0.x](docs/guide/migration-0.x.md) | breaking changes, before/after |
| [Feature spec](docs/SPEC-features.md) | multi-select, rename, checkboxes, drag-and-drop |
| API reference | `npm run docs:api` → `docs/api/` |
| [Examples](examples/) | 15 runnable examples (`cd examples && npm run dev`). Each is also a test, and the gallery can run every check live in your browser |
| Site | `npm run site` builds the gallery, API reference, test report and coverage into `site/`. CI publishes it to GitHub Pages |

For AI coding agents, [AGENTS.md](AGENTS.md) is the compact usage contract.

## Develop

```bash
nvm use            # Node 24
npm ci
npx playwright install chromium
npm run gate       # typecheck, lint, all tests + coverage, SQL, build, package checks, size
```

## License

MIT
