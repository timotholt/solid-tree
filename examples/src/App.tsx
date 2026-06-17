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

// ── 7. No persistence (in-memory) ────────────────────────────────────────────
const EphemeralDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>(null);
  const data: TreeNodeData[] = [
    { id: "a", label: "Section A", type: "group", children: [{ id: "a1", label: "Item", type: "item" }] },
    { id: "b", label: "Section B", type: "group", children: [{ id: "b1", label: "Item", type: "item" }] },
  ];
  // No storageKey → nothing written to localStorage; state resets on reload.
  return <Tree data={data} selectedId={sel()} onSelect={(n) => setSel(n.id)} />;
};

// Shared sample tree for the search demos.
const medTree = (): TreeNodeData[] => [
  {
    id: "cardio", label: "Cardiovascular", type: "group",
    children: [
      { id: "mi", label: "Myocardial infarction", type: "item", payload: { code: "I21" } },
      { id: "chf", label: "Heart failure", type: "item", payload: { code: "I50" } },
      { id: "afib", label: "Atrial fibrillation", type: "item", payload: { code: "I48" } },
    ],
  },
  {
    id: "resp", label: "Respiratory", type: "group",
    children: [
      { id: "copd", label: "COPD", type: "item", payload: { code: "J44" } },
      { id: "pna", label: "Pneumonia", type: "item", payload: { code: "J18" } },
    ],
  },
  {
    id: "renal", label: "Renal", type: "group",
    children: [{ id: "aki", label: "Acute kidney injury", type: "item", payload: { code: "N17" } }],
  },
];

// ── 8. Search: prune + highlight (default matcher) ────────────────────────────
const SearchDemo: Component = () => {
  const [q, setQ] = createSignal("art");
  const [sel, setSel] = createSignal<string | null>(null);
  return (
    <>
      <input class="search" placeholder="filter by label…" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      <Tree data={medTree()} searchQuery={q()} selectedId={sel()} storageKey="search" onSelect={(n) => setSel(n.id)} />
    </>
  );
};

// ── 9. Search: dim mode + custom matcher (searches payload.code) ──────────────
const SearchDimDemo: Component = () => {
  const [q, setQ] = createSignal("I");
  const [sel, setSel] = createSignal<string | null>(null);
  return (
    <>
      <input class="search" placeholder="match label OR ICD code…" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      <Tree
        data={medTree()} searchQuery={q()} selectedId={sel()}
        storageKey="searchdim" filterMode="dim"
        matcher={(n, query) => {
          const s = query.toLowerCase();
          return n.label.toLowerCase().includes(s) || String(n.payload?.code ?? "").toLowerCase().includes(s);
        }}
        onSelect={(n) => setSel(n.id)}
      />
    </>
  );
};

// ── 10. Theming via tokens + data-attributes ─────────────────────────────────
const ThemedDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>("mi");
  return (
    <div class="themed-tree">
      <Tree data={medTree()} selectedId={sel()} storageKey="themed" onSelect={(n) => setSel(n.id)} />
    </div>
  );
};

// ── 9. Multi-line rows (tokens + renderLabel) ─────────────────────────────────
const MultiLineDemo: Component = () => {
  const [sel, setSel] = createSignal<string | null>("q1");
  const data: TreeNodeData[] = [
    {
      id: "questions", label: "Questions", type: "group",
      children: [
        { id: "q1", label: "Q1", type: "item", payload: { stem: "A 54 y/o presents with crushing substernal chest pain radiating to the jaw…", meta: "Cardiovascular · Hard", status: "PENDING REVIEW" } },
        { id: "q2", label: "Q2", type: "item", payload: { stem: "Post-op day 2, urine output has fallen to 15 mL/hr over 4 hours…", meta: "Renal · Medium", status: "PUBLISHED" } },
      ],
    },
  ];
  return (
    <div class="multiline-tree">
      <Tree
        data={data} selectedId={sel()} storageKey="multiline" onSelect={(n) => setSel(n.id)}
        renderLabel={(n) =>
          n.payload?.stem ? (
            <div style="display:flex;flex-direction:column;gap:2px;line-height:1.3">
              <span>{n.payload.stem}</span>
              <span style="opacity:.6;font-size:.85em">{n.payload.meta}</span>
              <span style="opacity:.55;font-size:.8em;letter-spacing:.04em">{n.payload.status}</span>
            </div>
          ) : (
            n.label
          )
        }
      />
    </div>
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

    <Demo
      title="7. No persistence (in-memory)"
      blurb="Persistence is opt-in. Omit storageKey and expand state is in-memory only — nothing is written to localStorage, and multiple unkeyed trees never clobber each other."
      code={`<Tree
  data={data}
  onSelect={(n) => setSel(n.id)}
  // no storageKey → resets on reload
/>`}
    >
      <EphemeralDemo />
    </Demo>

    <Demo
      title="7b. Search — prune + highlight"
      blurb="Pass searchQuery. Default mode 'prune' keeps matches + their ancestor path, force-expands to reveal them (without touching saved expand state), and highlights the matched substring. Clear the box to restore the tree exactly as it was."
      code={`<Tree
  data={data}
  searchQuery={q()}        // default matcher: label substring
  onSelect={...}
/>`}
    >
      <SearchDemo />
    </Demo>

    <Demo
      title="7c. Search — dim mode + custom matcher"
      blurb="filterMode='dim' keeps the whole tree and fades non-matches instead of removing them. A custom matcher is the comparator seam — here it matches label OR payload.code (ICD), so Tree never needs to know payload's shape. Try 'I21' or 'copd'."
      code={`<Tree
  searchQuery={q()}
  filterMode="dim"
  matcher={(n, q) =>
    n.label.toLowerCase().includes(q.toLowerCase()) ||
    n.payload?.code?.toLowerCase().includes(q.toLowerCase())
  }
/>`}
    >
      <SearchDimDemo />
    </Demo>

    <Demo
      title="8. Theming — tokens + data-attributes"
      blurb="Every opinionated value is a --tree-* CSS var with a sane fallback (inline, so it works with no stylesheet). Override any of them on the container or any ancestor — no specificity fight. Rows also emit data-depth / data-variant / data-selected / data-has-children for CSS/Tailwind targeting."
      code={`.themed-tree {
  --tree-font-size: 15px;
  --tree-indent-step: 22px;
  --tree-group-weight: 600;
  --tree-row-active-bg: #2563eb;
  --tree-chevron-color: #60a5fa;
}
.themed-tree .solid-tree-row[data-selected] { color: #fff; }`}
    >
      <ThemedDemo />
    </Demo>

    <Demo
      title="9. Multi-line rows"
      blurb="Rows aren't fixed-height — they grow with content. Set --tree-label-white-space:normal + --tree-row-align-items:flex-start, then return a stacked block from renderLabel for 2/3/N-line items (e.g. a question stem + meta + status). Selection, chevron, indent all still work on the taller rows."
      code={`/* on the container */
.list { --tree-label-white-space: normal;
        --tree-row-align-items: flex-start; }

renderLabel={(n) => (
  <div style="display:flex;flex-direction:column">
    <span>{n.payload.stem}</span>
    <span>{n.payload.meta}</span>
    <span>{n.payload.status}</span>
  </div>
)}`}
    >
      <MultiLineDemo />
    </Demo>
  </main>
);
