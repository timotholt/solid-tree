import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { createTreeController, type TreeControllerOptions } from "../../src/controller/index.js";
import { coreOptionsFromProps } from "../../src/view/Tree.js";
import { expectConsole } from "../support/console.js";
import { inRoot } from "../support/root.js";
import { n, produce } from "../support/fixtures.js";
import type { TreeNodeData } from "../../src/types.js";

const make = (opts: Partial<TreeControllerOptions> = {}) =>
  inRoot(() => createTreeController({ data: () => produce(), ...opts }));
const rowIds = (t: { flatRows: () => { node: TreeNodeData }[] }) => t.flatRows().map((r) => r.node.id);

afterEach(() => localStorage.clear());

describe("createTreeController — basics", () => {
  it("starts collapsed with only roots visible", () => {
    const t = make();
    expect(rowIds(t)).toEqual(["fruit", "veg"]);
    expect(t.expandedIds()).toEqual({});
    expect(t.selectedId()).toBeNull();
    expect(t.searching()).toBe(false);
    expect(t.noMatches()).toBe(false);
  });

  it("nodes and displayNodes reflect the data when not searching", () => {
    const t = make();
    expect(t.nodes().map((x) => x.id)).toEqual(["fruit", "veg"]);
    expect(t.displayNodes().map((x) => x.id)).toEqual(["fruit", "veg"]);
  });

  it("warns when created without a reactive owner", () => {
    createTreeController({ data: () => [] });
    expect(expectConsole("warn", /without a reactive owner/)).toBe(1);
    expect(expectConsole("warn", /computations created outside a `createRoot`/)).toBeGreaterThan(0);
  });
});

describe("expansion", () => {
  it("expand/collapse/toggle change visible rows and fire onToggle", () => {
    const onToggle = vi.fn();
    const t = make({ onToggle });
    t.expand("fruit");
    expect(rowIds(t)).toEqual(["fruit", "apple", "banana", "berries", "veg"]);
    t.expand("fruit"); // idempotent
    t.toggle("berries");
    t.collapse("fruit");
    t.collapse("fruit"); // idempotent
    expect(rowIds(t)).toEqual(["fruit", "veg"]);
    expect(onToggle.mock.calls).toEqual([
      ["fruit", true],
      ["berries", true],
      ["fruit", false],
    ]);
  });

  it("expandAll opens every parent and fires onToggle only for newly opened ones", () => {
    const onToggle = vi.fn();
    const t = make({ onToggle });
    t.expand("veg");
    onToggle.mockClear();
    t.expandAll();
    expect(rowIds(t)).toHaveLength(9);
    expect(onToggle.mock.calls.map((c) => c[0]).sort()).toEqual(["apple", "berries", "fruit"]);
  });

  it("collapseAll closes everything and fires onToggle(false) for each open node", () => {
    const onToggle = vi.fn();
    const t = make({ onToggle });
    t.expandAll();
    onToggle.mockClear();
    t.collapseAll();
    expect(rowIds(t)).toEqual(["fruit", "veg"]);
    expect(onToggle.mock.calls.every((c) => c[1] === false)).toBe(true);
    expect(onToggle).toHaveBeenCalledTimes(4);
  });
});

describe("selection", () => {
  it("select sets selection and fires onSelect with the node", () => {
    const onSelect = vi.fn();
    const t = make({ onSelect });
    t.select("banana");
    expect(t.selectedId()).toBe("banana");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "banana" }));
  });

  it("select of an unknown id is a no-op", () => {
    const onSelect = vi.fn();
    const t = make({ onSelect });
    t.select("kiwi");
    expect(t.selectedId()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("canSelect vetoes selection", () => {
    const onSelect = vi.fn();
    const t = make({ onSelect, canSelect: (node) => node.id !== "banana" });
    t.select("banana");
    expect(t.selectedId()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("deselect clears an uncontrolled selection", () => {
    const t = make();
    t.select("banana");
    t.deselect();
    expect(t.selectedId()).toBeNull();
  });

  it("a controlled selectedId accessor wins over the internal signal", () => {
    const [sel, setSel] = createSignal<string | null>("carrot");
    const t = make({ selectedId: sel });
    expect(t.selectedId()).toBe("carrot");
    t.select("banana");
    expect(t.selectedId()).toBe("carrot");
    setSel("seed");
    expect(t.selectedId()).toBe("seed");
  });

  it("selecting a nested node reveals (expands) its ancestors and fires onToggle for them", () => {
    const onToggle = vi.fn();
    const t = make({ onToggle });
    t.select("seed");
    expect(rowIds(t)).toContain("seed");
    expect(onToggle.mock.calls).toEqual(
      expect.arrayContaining([
        ["fruit", true],
        ["apple", true],
      ])
    );
  });

  // Pre-B11 default, now opt-in (rewritten against the new option, PLAN §5.3).
  it("selectAncestorOnCollapse: collapsing an ancestor of the selection moves selection to it", () => {
    const onSelect = vi.fn();
    const t = make({ onSelect, selectAncestorOnCollapse: true });
    t.select("seed");
    onSelect.mockClear();
    t.collapse("fruit");
    expect(t.selectedId()).toBe("fruit");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "fruit" }));
  });
});

describe("search", () => {
  it("prune mode keeps matches + ancestors and force-expands the path", () => {
    const t = make({ searchQuery: () => "straw" });
    expect(t.searching()).toBe(true);
    expect(rowIds(t)).toEqual(["fruit", "berries", "straw"]);
    expect(t.expandedIds()).toMatchObject({ fruit: true, berries: true });
  });

  it("setSearch drives search when no controlled query is passed", () => {
    const t = make();
    t.setSearch("carrot");
    expect(rowIds(t)).toEqual(["veg", "carrot"]);
    t.setSearch("   ");
    expect(t.searching()).toBe(false);
  });

  it("reports noMatches in prune mode", () => {
    const t = make({ searchQuery: () => "kiwi" });
    expect(t.noMatches()).toBe(true);
    expect(rowIds(t)).toEqual([]);
  });

  it("dim mode keeps the whole tree and dims non-matches", () => {
    const t = make({ searchQuery: () => "carrot", filterMode: "dim" });
    expect(t.displayNodes().map((x) => x.id)).toEqual(["fruit", "veg"]);
    expect(t.noMatches()).toBe(false);
    expect(t._ctxState.isDimmed("fruit")).toBe(true);
    expect(t._ctxState.isDimmed("carrot")).toBe(false);
    expect(t._ctxState.isDimmed("veg")).toBe(false);
  });

  it("highlightQuery is the query for the default matcher and null for a custom one", () => {
    expect(make({ searchQuery: () => "app" })._ctxState.highlightQuery()).toBe("app");
    expect(make({ searchQuery: () => "app", matcher: () => true })._ctxState.highlightQuery()).toBeNull();
  });

  it("a custom matcher decides hits", () => {
    const t = make({ searchQuery: () => "x", matcher: (node) => node.id === "blue" });
    expect(rowIds(t)).toEqual(["fruit", "berries", "blue"]);
  });

  it("search does not change the saved expansion state", () => {
    const [q, setQ] = createSignal("seed");
    const t = make({ searchQuery: q });
    setQ("");
    expect(rowIds(t)).toEqual(["fruit", "veg"]);
  });
});

describe("persistence", () => {
  it("without storageKey nothing is written", () => {
    make().expand("fruit");
    expect(localStorage.length).toBe(0);
  });

  it("with storageKey expansion is saved under `${prefix}-${key}` and restored", () => {
    const a = make({ storageKey: "side" });
    a.expand("veg");
    expect(JSON.parse(localStorage.getItem("tree-side")!)).toEqual({ veg: true });
    a.dispose();
    const b = make({ storageKey: "side" });
    expect(rowIds(b)).toEqual(["fruit", "veg", "carrot"]);
  });

  it("storagePrefix changes the key", () => {
    make({ storageKey: "side", storagePrefix: "app" }).expand("veg");
    expect(localStorage.getItem("app-side")).not.toBeNull();
  });

  it("replays onToggle(true) on mount for restored open nodes", () => {
    localStorage.setItem("tree-side", JSON.stringify({ veg: true, fruit: false }));
    const onToggle = vi.fn();
    make({ storageKey: "side", onToggle });
    expect(onToggle.mock.calls).toEqual([["veg", true]]);
  });

  it("corrupt stored JSON falls back to empty state with a warning", () => {
    localStorage.setItem("tree-side", "{not json");
    const t = make({ storageKey: "side" });
    expect(rowIds(t)).toEqual(["fruit", "veg"]);
    expect(expectConsole("warn", /storage.get error/)).toBe(1);
  });
});

describe("reactivity of data", () => {
  it("rows follow data changes", () => {
    const [data, setData] = createSignal<TreeNodeData[]>([n("a")]);
    const t = inRoot(() => createTreeController({ data }));
    setData([n("a"), n("b")]);
    expect(rowIds(t)).toEqual(["a", "b"]);
  });
});

// ── Known defects (docs/ANALYSIS.md) ─────────────────────────────────────────────

it("regression(A1): props-built controller keeps an uncontrolled selection", () => {
  const props: { selectedId?: string | null; searchQuery?: string } = {};
  const t = inRoot(() => createTreeController({ data: () => produce(), ...coreOptionsFromProps(props) }));
  t.select("banana");
  expect(t.selectedId()).toBe("banana");
});

it("regression(A1): props-built controller honours setSearch when no searchQuery prop is passed", () => {
  const props: { selectedId?: string | null; searchQuery?: string } = {};
  const t = inRoot(() => createTreeController({ data: () => produce(), ...coreOptionsFromProps(props) }));
  t.setSearch("banana");
  expect(t.searching()).toBe(true);
});

it("regression(A2): collapsing a search-expanded node during search does not persist expanded=true", () => {
  const [q, setQ] = createSignal("seed");
  const onToggle = vi.fn();
  const t = make({ searchQuery: q, onToggle });
  t.toggle("apple"); // user tries to collapse during search
  setQ("");
  expect(t.expandedIds().apple).toBeFalsy();
  expect(onToggle).not.toHaveBeenCalledWith("apple", true);
});

it("regression(A2): the user can collapse a node while searching", () => {
  const t = make({ searchQuery: () => "seed" });
  t.toggle("apple");
  expect(rowIds(t)).not.toContain("seed");
});

it("regression(A3): a matched parent does not force-open its own subtree", () => {
  const t = make({ searchQuery: () => "Fruit" });
  expect(rowIds(t)).toEqual(["fruit"]);
});

it("regression(B9): restoring persisted state prunes ids that no longer exist", () => {
  localStorage.setItem("tree-side", JSON.stringify({ ghost: true, veg: true }));
  const onToggle = vi.fn();
  make({ storageKey: "side", onToggle });
  expect(onToggle).not.toHaveBeenCalledWith("ghost", true);
});

// Rewritten against the new API (PLAN §5.3): deselect is reported through
// onSelectionChange, not onSelect (whose node argument has no null case).
it("regression(B10): deselect notifies the app", () => {
  const onSelectionChange = vi.fn();
  const t = make({ onSelectionChange });
  t.select("banana");
  onSelectionChange.mockClear();
  t.deselect();
  expect(onSelectionChange).toHaveBeenCalledWith([]);
});

it("regression(B11): collapsing an ancestor of the selection does not emit a selection by default", () => {
  const onSelect = vi.fn();
  const t = make({ onSelect });
  t.select("seed");
  onSelect.mockClear();
  t.collapse("fruit");
  expect(onSelect).not.toHaveBeenCalled();
});

it("controllers built in separate roots dispose independently", () => {
  let disposeA!: () => void;
  const a = createRoot((d) => ((disposeA = d), createTreeController({ data: () => produce() })));
  disposeA();
  expect(a.flatRows()).toHaveLength(2);
});
