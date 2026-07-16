// Verifies the real <VirtualTree> (the /virtual subpath export). Mount via /?virtual.
import { createSignal, type Component } from "solid-js";
import { VirtualTree, type TreeNodeData } from "@timotholt/solid-tree/virtual";
import "@timotholt/solid-tree/theme.css";

// 200 groups × 25 items = ~5200 nodes, nested — big enough that a non-virtual
// tree would render thousands of DOM rows.
const data: TreeNodeData[] = Array.from({ length: 200 }, (_, g) => ({
  id: "g" + g,
  label: `Group ${g}`,
  type: "group",
  count: 25,
  children: Array.from({ length: 25 }, (_, i) => ({
    id: `g${g}-i${i}`,
    label: `Item ${g}.${i}`,
    type: "item",
    status: i % 7 === 0 ? "new" : undefined,
  })),
}));

export const VirtualDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  const [q, setQ] = createSignal("");
  const [domRows, setDomRows] = createSignal(0);
  const total = 200 + 200 * 25;
  return (
    <div style="font-family:system-ui;padding:16px;max-width:420px">
      <h2>&lt;VirtualTree&gt;</h2>
      <p style="font-size:13px;color:#555">
        Proof it's windowed, not all in the DOM: <strong>{domRows()} rows in DOM</strong> of{" "}
        {total.toLocaleString()} nodes. selected: {sel() ?? "(none)"}
      </p>
      <input
        placeholder="filter…"
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        style="width:100%;box-sizing:border-box;padding:6px 10px;margin-bottom:8px;border:1px solid #ccc;border-radius:6px"
      />
      {/* bounded-height parent — VirtualTree fills it */}
      <div style="height:420px;border:1px solid #ccc;border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:rgba(59,130,246,.14)">
        <VirtualTree
          data={data}
          ariaLabel="Virtualized item browser"
          selectedId={sel()}
          searchQuery={q()}
          storageKey="virtualdemo"
          onRangeChange={(start, end) => setDomRows(end - start + 1)}
          onSelect={(n) => setSel(n.id)}
          renderActionNode={(n) =>
            n.status === "new" ? (
              <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#dcfce7;color:#166534">new</span>
            ) : null
          }
        />
      </div>
    </div>
  );
};
