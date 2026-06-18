// Verifies <DatabaseTree> (the /database subpath) with a FAKE async source that
// simulates latency + lazy children. Mount via /?database.
import { createSignal, type Component } from "solid-js";
import { DatabaseTree } from "@timotholt/solid-tree/database";
import type { TreeSource, TreeNodeData } from "@timotholt/solid-tree/database";
import "@timotholt/solid-tree/theme.css";

const delay = <T,>(make: () => T, ms = 400): Promise<T> =>
  new Promise((res) => setTimeout(() => res(make()), ms));

// 50 expandable root folders; each lazily yields 20 leaf items on first expand.
const fakeSource: TreeSource = {
  getRoots: () =>
    delay(() =>
      Array.from({ length: 50 }, (_, i): TreeNodeData => ({
        id: "r" + i,
        label: `Folder ${i}`,
        type: "group",
        payload: {}, // no leaf flag + getChildren defined → expandable
      }))
    ),
  getChildren: (node) =>
    delay(() =>
      Array.from({ length: 20 }, (_, i): TreeNodeData => ({
        id: `${node.id}-c${i}`,
        label: `${node.label} · item ${i}`,
        type: "item",
        payload: { leaf: true },
      }))
    ),
};

export const DatabaseDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  return (
    <div style="font-family:system-ui;padding:16px;max-width:420px">
      <h2>&lt;DatabaseTree&gt;</h2>
      <p style="font-size:13px;color:#555">
        Async source (400ms latency), lazy children on expand, cached via TanStack
        Query, windowed via VirtualTree. selected: {sel() ?? "(none)"}
      </p>
      <div style="height:420px;border:1px solid #ccc;border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:rgba(59,130,246,.14)">
        <DatabaseTree source={fakeSource} selectedId={sel()} onSelect={(n) => setSel(n.id)} />
      </div>
    </div>
  );
};
