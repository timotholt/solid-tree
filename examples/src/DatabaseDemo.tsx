// Verifies <DatabaseTree> (the /database subpath) with a FAKE async source that
// simulates latency + lazy children. Mount via /?database.
import { createSignal, type Component } from "solid-js";
import { DatabaseTree } from "@timotholt/solid-tree/database";
import type { TreeSource, TreeNodeData, TreeChange } from "@timotholt/solid-tree/database";
import "@timotholt/solid-tree/theme.css";

// Deliberately slow so the async/loading is obvious — proves it's NOT all in RAM.
const delay = <T,>(make: () => T, ms = 700): Promise<T> =>
  new Promise((res) => setTimeout(() => res(make()), ms));

// Hold the live subscriber so the demo can fire "external" (collaborator) changes.
let emit: ((c: TreeChange) => void) | null = null;
let edits = 0;

const DEPTH = 4; // folders nest 4 levels deep, then leaf items
const folder = (id: string, label: string, depth: number): TreeNodeData => ({
  id,
  label,
  type: "group",
  payload: { depth }, // no leaf flag + getChildren defined → expandable
});
const leaf = (id: string, label: string): TreeNodeData => ({
  id,
  label,
  type: "item",
  payload: { leaf: true },
});

// BIG + DEEP async source so virtualization is unmistakable: 500 root folders,
// each lazily yielding 15 subfolders per level (4 levels) then 40 leaf items.
// Expand a few branches → thousands of visible rows, but only ~25 in the DOM.
const fakeSource: TreeSource = {
  getRoots: () => delay(() => Array.from({ length: 500 }, (_, i) => folder("f" + i, `Folder ${i}`, 0))),
  getChildren: (node) => {
    const depth = ((node.payload?.depth as number) ?? 0) + 1;
    return delay(() =>
      depth < DEPTH
        ? Array.from({ length: 15 }, (_, i) => folder(`${node.id}.${i}`, `${node.label} › ${i}`, depth))
        : Array.from({ length: 40 }, (_, i) => leaf(`${node.id}#${i}`, `${node.label} · item ${i}`))
    );
  },
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
        <strong>500 root folders, 4 levels deep, all lazy</strong> (700ms latency —
        watch the spinner). Cached via TanStack Query, windowed: only{" "}
        <strong>{domRows()} rows in the DOM</strong>. Expand a few branches —
        thousands of nodes, same ~25 in DOM. selected: {sel() ?? "(none)"}
      </p>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button onClick={() => emit?.({ type: "update", node: { id: "f0", label: `Folder 0 ✏️ edited by gf #${++edits}`, type: "group", payload: { depth: 0 } } })}>
          simulate edit (Folder 0)
        </button>
        <button onClick={() => emit?.({ type: "insert", parentId: null, node: { id: "f-new-" + Date.now(), label: "✨ New folder (from gf)", type: "group", payload: { depth: 0 } } })}>
          simulate insert
        </button>
        <button onClick={() => emit?.({ type: "remove", id: "f1" })}>simulate delete (Folder 1)</button>
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
