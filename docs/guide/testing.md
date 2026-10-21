# Testing your tree

## In your app's tests

- **Controllers** are plain Solid primitives. Create one inside `createRoot` and call
  its actions; no DOM is needed.
- **Components** work with `@solidjs/testing-library`. Rows are `[role="treeitem"]`
  with `data-tree-id`. Drive them with keyboard events (`ArrowDown`, `Enter`, `F2`…)
  or clicks.
- **Async data:** `createMemorySource(tree, { latency, failRate, seed })` from
  `@timotholt/solid-tree/testing` gives a deterministic, failure-injectable
  `TreeSource` with realtime mutations (`insert`, `update`, `remove`, `moveTo`).

```ts
import { createRoot } from "solid-js";
import { createTreeController } from "@timotholt/solid-tree";

createRoot((dispose) => {
  const tree = createTreeController({ data: myData });
  tree.select("deep");
  expect(tree.flatRows().map((r) => r.id)).toContain("deep"); // revealed
  dispose();
});
```

## For adapter authors

Run `runTreeSourceContract`. See [Data sources](data-sources.md#writing-an-adapter).

## How this library is tested

Run `npm run gate`. It covers:

- typecheck, lint, and unit + property tests;
- DOM tests and real-browser tests (Chromium; Firefox and WebKit nightly);
- axe-core accessibility checks;
- the SQL installer, run in Postgres via PGlite;
- packaging (pack → install → import in Node, server render, type-check);
- bundle-size budgets, and coverage thresholds.

Every fixed bug has a `regression(<ID>)` test tied to [ANALYSIS.md](../ANALYSIS.md).
