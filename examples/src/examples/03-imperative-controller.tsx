import { createTreeController, Tree, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 3,
  title: "Imperative controller",
  description:
    "Create the controller yourself with createTreeController and hand it to <Tree tree={tree}>. Your own buttons can then expand, collapse, select, search and reveal (scrollToId), and you can read its state live.",
  tags: ["controller", "scrollToId", "expandAll", "setSearch"],
};

const DEEP = "docs/guides/advanced/perf/memo";

const data: TreeNodeData[] = [
  {
    id: "docs",
    label: "docs",
    type: "dir",
    children: [
      { id: "docs/intro", label: "Introduction", type: "page" },
      {
        id: "docs/guides",
        label: "Guides",
        type: "dir",
        children: [
          { id: "docs/guides/install", label: "Installation", type: "page" },
          { id: "docs/guides/theming", label: "Theming", type: "page" },
          {
            id: "docs/guides/advanced",
            label: "Advanced",
            type: "dir",
            children: [
              { id: "docs/guides/advanced/headless", label: "Headless views", type: "page" },
              {
                id: "docs/guides/advanced/perf",
                label: "Performance",
                type: "dir",
                children: [
                  { id: "docs/guides/advanced/perf/virtual", label: "Virtualization", type: "page" },
                  { id: DEEP, label: "Memoizing rows", type: "page" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "api",
    label: "api",
    type: "dir",
    children: [
      { id: "api/tree", label: "Tree", type: "page" },
      { id: "api/controller", label: "createTreeController", type: "page" },
    ],
  },
  ...Array.from({ length: 12 }, (_, i): TreeNodeData => ({ id: `changelog/${i + 1}`, label: `Release 0.${12 - i}`, type: "page" })),
];

export default function ImperativeController() {
  // The controller must be created inside a component (or createRoot): it owns signals.
  const tree = createTreeController({ data, onSelect: (n) => console.info("selected", n.id) });
  const expandedCount = () => Object.values(tree.expandedIds()).filter(Boolean).length;

  return (
    <div class="split">
      <div>
        <div class="toolbar">
          <button type="button" data-testid="expand-all" onClick={() => tree.expandAll()}>
            Expand all
          </button>
          <button type="button" data-testid="collapse-all" onClick={() => tree.collapseAll()}>
            Collapse all
          </button>
          <button type="button" data-testid="select-api" onClick={() => tree.select("api/controller")}>
            Select “createTreeController”
          </button>
          <button type="button" data-testid="reveal" onClick={() => tree.scrollToId(DEEP)}>
            Reveal “Memoizing rows”
          </button>
          <input
            type="search"
            aria-label="Search the docs tree"
            placeholder="Search…"
            data-testid="search"
            onInput={(e) => tree.setSearch(e.currentTarget.value)}
          />
        </div>
        {/* A short scroll box, so scrollToId visibly scrolls the revealed row into view. */}
        <div style={{ "max-height": "220px", overflow: "auto" }}>
          {/* With tree={...}, configure the controller — not data/onSelect props here. */}
          <Tree tree={tree} ariaLabel="Documentation" />
        </div>
      </div>
      <div class="panel" aria-live="polite">
        <p class="muted">Controller state (read live)</p>
        <p>
          selectedId: <code data-testid="selected">{tree.selectedId() ?? "none"}</code>
        </p>
        <p>
          expanded: <code data-testid="expanded">{expandedCount()}</code>
        </p>
        <p>
          query: <code data-testid="query">{tree.query() || "—"}</code> · matches: <code data-testid="matches">{tree.matchCount()}</code>
        </p>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const $ = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  h.expect($("expanded").textContent).toBe("0");

  await h.click($("expand-all"));
  h.expect(h.has(DEEP)).toBe(true);
  h.expect(Number($("expanded").textContent)).toBe(5); // docs, guides, advanced, perf, api

  await h.click($("collapse-all"));
  h.expect(h.has("docs/intro")).toBe(false);

  // select() reveals the selection's ancestors (revealSelection defaults to true).
  await h.click($("select-api"));
  h.expect($("selected").textContent).toBe("api/controller");
  h.expect(h.row("api/controller").getAttribute("aria-selected")).toBe("true");

  // scrollToId expands every ancestor of the deep node, then scrolls it into view.
  await h.click($("reveal"));
  h.expect(h.has(DEEP)).toBe(true);
  h.expect(h.row("docs/guides/advanced/perf").getAttribute("aria-expanded")).toBe("true");

  await h.type($("search") as HTMLInputElement, "memo");
  h.expect($("query").textContent).toBe("memo");
  h.expect($("matches").textContent).toBe("1");
  h.expect(h.has("api/tree")).toBe(false); // pruned
  await h.type($("search") as HTMLInputElement, "");
  h.expect(h.has("api/tree")).toBe(true);
};

