# Performance

## Measured (Node 24, Apple Silicon; `npm run bench`)

| Operation | 10k nodes | 100k nodes |
|---|---|---|
| Build the index | 1.4 ms | 10 ms |
| Flatten, everything expanded | 0.6 ms | 6 ms |
| Search + flatten | 2.4 ms | 29 ms |

Growth is gated in CI: 10× the nodes must cost well under 30× the time, so nothing is
quadratic.

## Guidance

- **More than a few thousand visible rows:** use `<VirtualTree>`. It renders only the
  window, about 30 rows regardless of size. Give it a bounded height.
- **Huge or remote trees:** use `<DatabaseTree>`. Children load on expand, and server
  search avoids loading everything.
- **Search on every keystroke** is fine at 100k in memory. For a slow matcher, debounce
  the query in your app.
- **Stable node objects** help: a change re-indexes the tree, but rows keep their
  identity by id, so unchanged rows do not re-render.
- **Bundle size**, brotli, peers excluded: core about 11.6 kB, `/headless` about 8 kB.
  Budgets are enforced in CI (`.size-limit.json`).
