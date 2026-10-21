# Getting started

## Requirements

A SolidJS app (`solid-js` ≥ 1.9.16) built with **Vite + `vite-plugin-solid`**. The
package ships its TypeScript source under the `solid` export condition, so your build
compiles it with your own Solid compiler and there is exactly one Solid instance. Other
bundlers use the compiled `dist/` entries, and Node uses the server build.

## Install

```bash
npm i @timotholt/solid-tree
```

Until the package is on npm, install from git with a semver range:

```jsonc
"@timotholt/solid-tree": "github:timotholt/solid-tree#semver:^0.16.0"
```

Optional peers, only for the tiers you import:

| Import | Needs |
|---|---|
| `@timotholt/solid-tree` (`<Tree>`) | nothing |
| `/virtual` (`<VirtualTree>`) | `@tanstack/solid-virtual` ≥ 3.13.32 |
| `/database` (`<DatabaseTree>`) | + `@tanstack/solid-query` ≥ 5.30 |
| `/supabase` (`<SupabaseTree>`) | + `@supabase/supabase-js` ≥ 2.45 |
| `/headless`, `/testing` | nothing extra |

## Configure Vite (required)

```ts
// vite.config.ts
export default defineConfig({
  plugins: [solid()],
  // One copy of solid-js. Skipping this can render a blank, dead tree in production builds.
  resolve: { dedupe: ["solid-js", "@tanstack/solid-virtual", "@tanstack/solid-query"] },
  optimizeDeps: { exclude: ["@timotholt/solid-tree"] },
});
```

## Your first tree

```tsx
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import "@timotholt/solid-tree/theme.css"; // optional cosmetics: hover, selection, focus ring

const data: TreeNodeData[] = [
  { id: "fruit", label: "Fruit", type: "group", children: [
    { id: "apple", label: "Apple", type: "item" },
    { id: "banana", label: "Banana", type: "item" },
  ] },
];

export const Sidebar = () => <Tree data={data} ariaLabel="Produce" onSelect={(n) => console.log(n.id)} />;
```

You get keyboard navigation, type-ahead, roving focus and full ARIA without extra
configuration.

## Next

- [Concepts](concepts.md): controllers vs views, controlled inputs, the tiers.
- [Data sources](data-sources.md): async and realtime data, writing an adapter.
- [Theming](theming.md), [Accessibility](../ACCESSIBILITY.md), [Performance](performance.md),
  [Testing](testing.md), [Migrating from 0.x](migration-0.x.md).
- The example gallery in `examples/` (`npm run dev` there): every example is also a test.
