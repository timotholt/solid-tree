import { createSignal, type Component } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/tree";
import "@timotholt/tree/theme.css";
import { Demo } from "./Demo.jsx";

// ── 1. Basics: nesting, expand/collapse, selection, persistence ──────────────
const BasicDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>("apple");
  const data: TreeNodeData[] = [
    {
      id: "fruit", label: "Fruit", type: "group",
      children: [
        { id: "apple", label: "Apple", type: "item" },
        { id: "banana", label: "Banana", type: "item" },
        {
          id: "berries", label: "Berries", type: "group",
          children: [
            { id: "straw", label: "Strawberry", type: "item" },
            { id: "blue", label: "Blueberry", type: "item" },
          ],
        },
      ],
    },
    {
      id: "veg", label: "Vegetables", type: "group",
      children: [{ id: "carrot", label: "Carrot", type: "item" }],
    },
  ];
  return (
    <>
      <Tree data={data} selectedId={sel()} storageKey="basic" onSelect={(n) => setSel(n.id)} />
      <p class="out">selected: {sel() ?? "(none)"} — expand state persists across reloads</p>
    </>
  );
};

// ── 2. Icons + counts ────────────────────────────────────────────────────────
const IconsDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  const data: TreeNodeData[] = [
    {
      id: "cardio", label: "Cardiovascular", type: "group", iconLeft: "🫀", count: 2,
      children: [
        { id: "mi", label: "MI", type: "item", iconLeft: "📄", count: 4 },
        { id: "chf", label: "Heart failure", type: "item", iconLeft: "📄", iconRight: "⭐" },
      ],
    },
  ];
  return <Tree data={data} selectedId={sel()} storageKey="icons" onSelect={(n) => setSel(n.id)} />;
};

// ── 3. Badges / actions via renderActionNode ─────────────────────────────────
const ActionsDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>("draft");
  const [log, setLog] = createSignal("");
  const data: TreeNodeData[] = [
    { id: "draft", label: "Draft case", type: "item", status: "new" },
    { id: "review", label: "In review", type: "item", count: 3 },
    { id: "done", label: "Published", type: "item" },
  ];
  return (
    <>
      <Tree
        data={data} selectedId={sel()} storageKey="actions"
        onSelect={(n) => setSel(n.id)}
        renderActionNode={(n) => (
          <>
            {n.status === "new" && <span class="badge">new</span>}
            {n.count != null && <span class="badge badge-num">{n.count}</span>}
            <button class="row-btn" onClick={() => setLog(`deleted ${n.id}`)}>✕</button>
          </>
        )}
      />
      <p class="out">{log() || "click ✕ — slot clicks don't select the row"}</p>
    </>
  );
};

// ── 4. Custom label rendering ────────────────────────────────────────────────
const LabelDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  const data: TreeNodeData[] = [
    { id: "a", label: "passed", type: "item", payload: { ok: true } },
    { id: "b", label: "failed", type: "item", payload: { ok: false } },
  ];
  return (
    <Tree
      data={data} selectedId={sel()} storageKey="label"
      onSelect={(n) => setSel(n.id)}
      renderLabel={(n) => (
        <span style={{ color: n.payload?.ok ? "#16a34a" : "#dc2626" }}>
          {n.payload?.ok ? "✓ " : "✗ "}{n.label}
        </span>
      )}
    />
  );
};

// ── 5. Dividers + the "action" variant ───────────────────────────────────────
const VariantDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  const data: TreeNodeData[] = [
    { id: "recent", label: "Recent", type: "group", children: [{ id: "r1", label: "Item 1", type: "item" }] },
    { id: "div", label: "", type: "divider", isDivider: true },
    { id: "archived", label: "Archived", type: "group", children: [{ id: "a1", label: "Old item", type: "item" }] },
    { id: "add", label: "+ New folder", type: "add", variant: "action" },
  ];
  return <Tree data={data} selectedId={sel()} storageKey="variant" onSelect={(n) => setSel(n.id)} />;
};

// ── 6. Indentation knobs + storagePrefix + onToggle ──────────────────────────
const ControlledDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  const [evt, setEvt] = createSignal("");
  const data: TreeNodeData[] = [
    {
      id: "root", label: "Wide indent", type: "group",
      children: [
        { id: "c1", label: "Child", type: "group", children: [{ id: "g1", label: "Grandchild", type: "item" }] },
      ],
    },
  ];
  return (
    <>
      <Tree
        data={data} selectedId={sel()} storageKey="tree" storagePrefix="myapp"
        basePadding={16} indentStep={28}
        onSelect={(n) => setSel(n.id)}
        onToggle={(id, open) => setEvt(`${id} → ${open ? "expanded" : "collapsed"}`)}
      />
      <p class="out">{evt() || "toggle a node — onToggle fires; key = myapp-tree"}</p>
    </>
  );
};

export const App: Component = () => (
  <main>
    <h1>@timotholt/tree</h1>
    <p class="lede">
      Live examples. Each card shows the rendered component next to the exact code
      that produced it. Install: <code>github:timotholt/solid-tree#v0.1.0</code>
    </p>

    <Demo
      title="1. Basics"
      blurb="Nesting, expand/collapse, single-select, and localStorage-persisted expand state. Click a parent to select + expand; click again to collapse."
      code={`<Tree
  data={data}              // TreeNodeData[]
  selectedId={sel()}
  storageKey="basic"       // persists expand state
  onSelect={(n) => setSel(n.id)}
/>`}
    >
      <BasicDemo />
    </Demo>

    <Demo
      title="2. Icons & counts"
      blurb="iconLeft / iconRight take a string or any JSX.Element. count renders as (n) after the label."
      code={`{ id: "mi", label: "MI", type: "item",
  iconLeft: "📄", iconRight: "⭐", count: 4 }`}
    >
      <IconsDemo />
    </Demo>

    <Demo
      title="3. Badges & actions"
      blurb="renderActionNode(node) draws a right-aligned slot per row. Clicks inside it don't trigger row selection. Return null to skip a row."
      code={`renderActionNode={(n) => (
  <>
    {n.status === "new" && <span class="badge">new</span>}
    {n.count != null && <span class="badge">{n.count}</span>}
    <button onClick={() => del(n.id)}>✕</button>
  </>
)}`}
    >
      <ActionsDemo />
    </Demo>

    <Demo
      title="4. Custom labels"
      blurb="renderLabel(node) replaces the default label text — style it, add inline status, anything."
      code={`renderLabel={(n) => (
  <span style={{ color: n.payload.ok ? "green" : "red" }}>
    {n.payload.ok ? "✓ " : "✗ "}{n.label}
  </span>
)}`}
    >
      <LabelDemo />
    </Demo>

    <Demo
      title="5. Dividers & action rows"
      blurb="isDivider draws a horizontal rule. variant:'action' renders a centered, dimmed, chevron-less row — for affordances like '+ Add'."
      code={`{ id: "div", isDivider: true, ... },
{ id: "add", label: "+ New folder",
  type: "add", variant: "action" }`}
    >
      <VariantDemo />
    </Demo>

    <Demo
      title="6. Indent, prefix & onToggle"
      blurb="basePadding/indentStep tune depth indentation. storagePrefix namespaces the localStorage key. onToggle(id, expanded) fires on every expand/collapse."
      code={`<Tree
  basePadding={16} indentStep={28}
  storageKey="tree" storagePrefix="myapp"  // → myapp-tree
  onToggle={(id, open) => log(id, open)}
  ...
/>`}
    >
      <ControlledDemo />
    </Demo>
  </main>
);
