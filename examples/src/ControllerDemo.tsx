// Imperative controller demo (?controller). Builds a createTreeController over a big
// in-memory tree and drives it ENTIRELY from outside the view — toolbar buttons call
// tree.expandAll()/collapseAll()/select()/deselect(), a search box calls tree.setSearch().
// The <VirtualTree tree={tree}/> is just a window onto the controller's state. No backend.
import { createSignal, type Component } from "solid-js";
import { VirtualTree, createTreeController } from "@timotholt/solid-tree/virtual";
import type { TreeNodeData } from "@timotholt/solid-tree/virtual";
import "@timotholt/solid-tree/theme.css";

const GROUPS = 60;
const ITEMS = 40;
const data: TreeNodeData[] = Array.from({ length: GROUPS }, (_, g) => ({
  id: `g${g}`,
  label: `Group ${String(g).padStart(2, "0")}`,
  type: "group",
  children: Array.from({ length: ITEMS }, (_, i) => ({
    id: `g${g}-i${i}`,
    label: `Item ${String(g).padStart(2, "0")}.${String(i).padStart(2, "0")}`,
    type: "item",
    payload: { leaf: true },
  })),
}));

export const ControllerDemo: Component = () => {
  const [domRows, setDomRows] = createSignal(0);
  const [query, setQuery] = createSignal("");

  // The controller owns all state; this component only holds a ref to it and calls methods.
  const tree = createTreeController({ data: () => data });

  const randomLeaf = () => `g${Math.floor(Math.random() * GROUPS)}-i${Math.floor(Math.random() * ITEMS)}`;

  return (
    <div style="font-family:system-ui;padding:16px;max-width:560px">
      <h2>Imperative controller API</h2>
      <p style="font-size:13px;color:#555">
        One <code>createTreeController</code> over {GROUPS * ITEMS + GROUPS} nodes, driven from
        outside via the buttons below — the <code>&lt;VirtualTree tree={"{tree}"}/&gt;</code> is
        just a view. Selecting a deep leaf auto-expands its ancestors. (Lock actions live on the
        Supabase controller — see the <em>&lt;SupabaseTree&gt;</em> demo.)
      </p>

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <button onClick={() => tree.expandAll()}>Expand all</button>
        <button onClick={() => tree.collapseAll()}>Collapse all</button>
        <button onClick={() => tree.select(randomLeaf())}>Select random leaf</button>
        <button onClick={() => tree.deselect()}>Deselect</button>
      </div>
      <input
        type="text"
        placeholder="setSearch(…)"
        value={query()}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          tree.setSearch(e.currentTarget.value);
        }}
        style="width:100%;box-sizing:border-box;padding:6px 8px;margin-bottom:8px;font-size:13px"
      />

      <div style="font-size:12px;color:#666;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap">
        <span>selected: <strong>{tree.selectedId() ?? "(none)"}</strong></span>
        <span>searching: <strong>{String(tree.searching())}</strong></span>
        <span>visible rows: <strong>{tree.flatRows().length}</strong></span>
        <span>in DOM: <strong>{domRows()}</strong></span>
      </div>

      <div style="height:420px;border:1px solid #ccc;border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:rgba(59,130,246,.14)">
        <VirtualTree tree={tree} onRangeChange={(s, e) => setDomRows(e - s + 1)} />
      </div>
    </div>
  );
};
