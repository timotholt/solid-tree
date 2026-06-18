// Verifies <DatabaseTree> (the /database subpath) with a FAKE async source that
// simulates latency + lazy children. Mount via /?database.
import { createSignal, type Component } from "solid-js";
import { DatabaseTree } from "@timotholt/solid-tree/database";
import type { TreeSource, TreeNodeData, TreeChange } from "@timotholt/solid-tree/database";
import "@timotholt/solid-tree/theme.css";

// Deliberately slow so the async/loading is obvious — proves it's NOT all in RAM.
const delay = <T,>(make: () => T, ms = 900): Promise<T> =>
  new Promise((res) => setTimeout(() => res(make()), ms));

// Hold the live subscriber so the demo can fire "external" (collaborator) changes.
let emit: ((c: TreeChange) => void) | null = null;
let edits = 0;

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
  subscribe: (onChange) => {
    emit = onChange; // demo stashes the subscriber so a button can fire "external" edits
    return () => (emit = null);
  },
};

export const DatabaseDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  const [domRows, setDomRows] = createSignal(0);
  return (
    <div style="font-family:system-ui;padding:16px;max-width:420px">
      <h2>&lt;DatabaseTree&gt;</h2>
      <p style="font-size:13px;color:#555">
        Async source (<strong>900ms latency — watch the spinner</strong>), lazy
        children on expand, cached via TanStack Query, windowed. {domRows()} rows in
        DOM. selected: {sel() ?? "(none)"}
      </p>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button onClick={() => emit?.({ type: "update", node: { id: "r0", label: `Folder 0 ✏️ edited by gf #${++edits}`, type: "group", payload: {} } })}>
          simulate edit (Folder 0)
        </button>
        <button onClick={() => emit?.({ type: "insert", parentId: null, node: { id: "r-new-" + Date.now(), label: "✨ New folder (from gf)", type: "group", payload: {} } })}>
          simulate insert
        </button>
        <button onClick={() => emit?.({ type: "remove", id: "r1" })}>simulate delete (Folder 1)</button>
      </div>
      <div style="height:420px;border:1px solid #ccc;border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:rgba(59,130,246,.14)">
        <DatabaseTree
          source={fakeSource}
          selectedId={sel()}
          onRangeChange={(start, end) => setDomRows(end - start + 1)}
          onSelect={(n) => setSel(n.id)}
        />
      </div>
    </div>
  );
};
