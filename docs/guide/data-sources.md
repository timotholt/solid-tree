# Data sources

`<DatabaseTree>` renders any async backend through a small interface:

```ts
interface TreeSource {
  getRoots(): Promise<TreeNodeData[]>;
  getChildren?(node: TreeNodeData): Promise<TreeNodeData[]>;      // lazy, on first expand
  subscribe?(onChange: (change: TreeChange) => void): () => void;  // realtime
  search?(query: string): Promise<TreeNodeData[]>;                 // server-side search
  getAncestors?(id: string): Promise<string[]>;                    // reveal search hits
  compare?(a: TreeNodeData, b: TreeNodeData): number;              // sibling order for inserts
  move?(sources: string[], target: string, position: "before" | "after" | "inside"): Promise<boolean | void>;
}
```

Mark leaves with `payload.leaf = true`, so they show no chevron. Any other node is
treated as expandable when `getChildren` exists.

## Realtime changes

```ts
type TreeChange =
  | { type: "insert"; parentId: string | null; node }
  | { type: "update"; node; parentId?: string | null }  // a different parentId = a move
  | { type: "move"; id; parentId: string | null; index? }
  | { type: "remove"; id }
  | { type: "reload" };                                  // can't express it? refetch
```

Changes apply in one batch. Inserts under an unloaded parent make it expandable. A move
of a node the client never loaded refetches its new parent.

## Loading and errors

`tree.loading(id)`, `tree.error(id)` and `tree.retry(id)` (`null` = the roots). The view
shows a "Loading…" row under a loading branch (and sets `aria-busy` on the parent), and
an error row that retries on click. Failed loads are not retried automatically.

## Caching

Children are cached through TanStack Query, under a per-tree key namespace
(`queryKeyPrefix`), so several trees can share one `QueryClient`. A tree removes its
entries when it unmounts. Concurrent child loads are capped by `maxConcurrentLoads`
(default 4).

## Writing an adapter

Write your `TreeSource`, then run the **contract suite** against it. The suite seeds
your backend with a known tree and checks roots, children, order, leaf flags, unique ids,
realtime events, search and ancestors:

```ts
import { describe, it, expect } from "vitest";
import { runTreeSourceContract } from "@timotholt/solid-tree/testing";

runTreeSourceContract("my REST source", async (tree) => {
  await seedMyBackend(tree);
  return { source: myRestSource(), mutate: { insert, update, remove }, cleanup: wipe };
}, { describe, it, expect });
```

`createMemorySource(tree, { latency, failRate, seed })` from `/testing` is a reference
adapter. Use it for prototypes, demos and tests: it supports realtime mutations,
failures and search.

## Supabase

`<SupabaseTree client table toNode parentColumn …>` builds the source for you. It uses
keyset pagination and per-tree realtime channels. For "one editor per record" locking,
install the SQL once (`supabase/migrations/0003_solid_tree_lock.sql`), then run
`select solid_tree.install_lock('public.your_table')` for each table. See
[supabase/README.md](../../supabase/README.md).
