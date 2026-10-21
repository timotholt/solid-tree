import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { createTreeController, CORE_OPTION_KEYS, type CoreControllerOptions, type TreeControllerOptions } from "../../src/controller/index.js";
import { localStoragePersistence, memoryPersistence } from "../../src/state/persistence.js";
import { expectConsole } from "../support/console.js";
import { inRoot } from "../support/root.js";
import { n, produce } from "../support/fixtures.js";

const make = (opts: Partial<TreeControllerOptions> = {}) => inRoot(() => createTreeController({ data: () => produce(), ...opts }));
const rowIds = (t: { flatRows: () => { id: string }[] }) => t.flatRows().map((r) => r.id);
afterEach(() => localStorage.clear());

describe("options are declared once (D3)", () => {
  it("CORE_OPTION_KEYS is exactly keyof CoreControllerOptions", () => {
    type Listed = (typeof CORE_OPTION_KEYS)[number];
    expectTypeOf<Listed>().toEqualTypeOf<keyof CoreControllerOptions>();
    expect(new Set(CORE_OPTION_KEYS).size).toBe(CORE_OPTION_KEYS.length);
  });
});

describe("controlled iff passed (A1)", () => {
  it("a present-but-undefined selectedId is controlled (internal selection ignored)", () => {
    const t = make({ selectedId: undefined });
    t.select("banana");
    expect(t.selectedId()).toBeNull();
  });

  it("an absent selectedId is uncontrolled", () => {
    const t = make();
    t.select("banana");
    expect(t.selectedId()).toBe("banana");
  });

  it("warns when a controlled value drops back to undefined", () => {
    const [sel, setSel] = createSignal<string | undefined>("banana");
    make({ selectedId: sel });
    setSel(undefined);
    expect(expectConsole("warn", /controlled `selectedId` became undefined/)).toBe(1);
  });

  it("accepts plain values as well as accessors", () => {
    expect(make({ selectedId: "carrot" }).selectedId()).toBe("carrot");
    expect(make({ searchQuery: "carrot" }).searching()).toBe(true);
  });
});

describe("controlled expansion", () => {
  it("expandedIds drives the rows; actions report through onExpandedChange", () => {
    const [ids, setIds] = createSignal<string[]>(["veg"]);
    const onExpandedChange = vi.fn();
    const t = make({ expandedIds: ids, onExpandedChange });
    expect(rowIds(t)).toEqual(["fruit", "veg", "carrot"]);
    t.expand("fruit");
    expect(onExpandedChange).toHaveBeenLastCalledWith(["veg", "fruit"]);
    expect(rowIds(t)).not.toContain("apple"); // parent has not applied it yet
    setIds(["veg", "fruit"]);
    expect(rowIds(t)).toContain("apple");
  });
});

describe("persistence", () => {
  it("reads the historical Record<id, boolean> format and writes it back", () => {
    localStorage.setItem("tree-side", JSON.stringify({ veg: true, fruit: false }));
    const t = make({ storageKey: "side" });
    expect(rowIds(t)).toEqual(["fruit", "veg", "carrot"]);
    t.expand("fruit");
    expect(JSON.parse(localStorage.getItem("tree-side")!)).toEqual({ veg: true, fruit: true });
  });

  it("also reads an id array", () => {
    expect(localStoragePersistence("k").load()).toBeNull();
    localStorage.setItem("k", JSON.stringify(["a", 1, "b"]));
    expect(localStoragePersistence("k").load()).toEqual(["a", "b"]);
  });

  it("a custom adapter wins over storageKey", () => {
    const p = memoryPersistence(["veg"]);
    const t = make({ persistence: p, storageKey: "ignored" });
    expect(rowIds(t)).toContain("carrot");
    t.collapse("veg");
    expect(p.saved).toEqual([]);
    expect(localStorage.getItem("tree-ignored")).toBeNull();
  });
});

describe("search ephemeral layer (A2)", () => {
  it("expanding during search does not persist and resets when search ends", () => {
    const [q, setQ] = createSignal("Fruit");
    const p = memoryPersistence();
    const t = make({ searchQuery: q, persistence: p });
    t.expand("fruit"); // matched parent, opened during search
    expect(rowIds(t)).toContain("apple");
    setQ("");
    expect(rowIds(t)).toEqual(["fruit", "veg"]);
    expect(p.saved).toEqual([]);
  });

  it("onToggle still fires during search so lazy tiers can load", () => {
    const onToggle = vi.fn();
    const t = make({ searchQuery: "Fruit", onToggle });
    t.expand("fruit");
    expect(onToggle).toHaveBeenCalledWith("fruit", true);
  });
});

describe("selection modes", () => {
  it("multiple: toggleSelected, selectRange over visible rows, selectAll", () => {
    const onSelectionChange = vi.fn();
    const t = make({ selectionMode: "multiple", onSelectionChange, expandedIds: ["fruit"] });
    t.select("apple");
    t.selectRange("berries");
    expect([...t.selectedIds()]).toEqual(["apple", "banana", "berries"]);
    t.toggleSelected("banana");
    expect([...t.selectedIds()]).toEqual(["apple", "berries"]);
    t.selectAll();
    expect([...t.selectedIds()]).toEqual(["fruit", "apple", "banana", "berries", "veg"]);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it("disabled nodes cannot be selected, and ranges skip them", () => {
    const data = [n("a"), n("b", undefined, { disabled: true }), n("c")];
    const t = inRoot(() => createTreeController({ data, selectionMode: "multiple" }));
    t.select("b");
    expect(t.selectedId()).toBeNull();
    t.select("a");
    t.selectRange("c");
    expect([...t.selectedIds()]).toEqual(["a", "c"]);
  });

  it("controlled selectedIds", () => {
    const t = make({ selectionMode: "multiple", selectedIds: ["apple", "veg"] });
    expect([...t.selectedIds()]).toEqual(["apple", "veg"]);
  });
});

describe("reveal and activation", () => {
  it("revealSelection: false leaves ancestors closed", () => {
    const t = make({ revealSelection: false });
    t.select("seed");
    expect(rowIds(t)).toEqual(["fruit", "veg"]);
  });

  it("an initial selection is revealed synchronously (G8)", () => {
    const onToggle = vi.fn();
    const t = make({ selectedId: "seed", onToggle });
    expect(rowIds(t)).toContain("seed");
  });

  it("activate calls onActivate with the node", () => {
    const onActivate = vi.fn();
    make({ onActivate }).activate("banana");
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "banana" }));
  });

  it("scrollToId reveals and calls the registered scroller", () => {
    const t = make();
    const scroll = vi.fn();
    t._registerScroller(scroll);
    t.scrollToId("blue");
    expect(rowIds(t)).toContain("blue");
    expect(scroll).toHaveBeenCalledWith("blue");
  });
});

describe("rows", () => {
  it("carry ids, levels and set positions (E1 data)", () => {
    const t = make({ expandedIds: ["fruit"] });
    expect(t.flatRows().find((r) => r.id === "banana")).toMatchObject({ level: 2, posinset: 2, setsize: 3, parentId: "fruit" });
  });

  it("flatRows is memoized (same array until something changes)", () => {
    const t = make();
    expect(t.flatRows()).toBe(t.flatRows());
  });

  it("duplicate ids are reported clearly", () => {
    expect(() => inRoot(() => createTreeController({ data: [n("a"), n("a")] }).flatRows())).toThrow(/duplicate node id "a"/);
  });
});
