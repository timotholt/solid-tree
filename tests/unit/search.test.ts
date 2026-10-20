import { describe, expect, it } from "vitest";
import {
  collectExpandable,
  collectIds,
  containsDescendant,
  defaultMatcher,
  findNode,
  flattenVisible,
  pruneNode,
} from "../../src/search.js";
import { n, produce } from "../support/fixtures.js";

const ids = (rows: { node: { id: string } }[]) => rows.map((r) => r.node.id);

describe("defaultMatcher", () => {
  it("is a case-insensitive substring test on label", () => {
    expect(defaultMatcher(n("x", undefined, { label: "Banana" }), "NAN")).toBe(true);
    expect(defaultMatcher(n("x", undefined, { label: "Banana" }), "kiwi")).toBe(false);
  });
});

describe("pruneNode", () => {
  it("keeps a match plus its ancestor path, dropping non-matching siblings", () => {
    const [fruit] = produce();
    const pruned = pruneNode(fruit, "straw", defaultMatcher)!;
    expect(pruned.id).toBe("fruit");
    expect(pruned.children!.map((c) => c.id)).toEqual(["berries"]);
    expect(pruned.children![0].children!.map((c) => c.id)).toEqual(["straw"]);
  });
  it("keeps a matched node's full original subtree", () => {
    const [fruit] = produce();
    const pruned = pruneNode(fruit, "berries", defaultMatcher)!;
    expect(pruned.children![0].children!.map((c) => c.id)).toEqual(["straw", "blue"]);
  });
  it("returns null when nothing in the subtree matches", () => {
    expect(pruneNode(produce()[1], "kiwi", defaultMatcher)).toBeNull();
  });
  it("drops dividers while filtering", () => {
    expect(pruneNode(n("d", undefined, { isDivider: true, label: "" }), "", () => true)).toBeNull();
  });
  it("does not mutate the input", () => {
    const tree = produce();
    const before = JSON.stringify(tree);
    pruneNode(tree[0], "seed", defaultMatcher);
    expect(JSON.stringify(tree)).toBe(before);
  });
});

describe("tree walks", () => {
  it("collectExpandable marks every node with children", () => {
    expect(Object.keys(collectExpandable(produce(), {})).sort()).toEqual(["apple", "berries", "fruit", "veg"]);
  });
  it("collectIds visits every node once", () => {
    expect([...collectIds(produce(), new Set())].sort()).toEqual(
      ["apple", "banana", "berries", "blue", "carrot", "fruit", "seed", "straw", "veg"]
    );
  });
  it("findNode finds nested nodes and returns null when absent", () => {
    expect(findNode(produce(), "blue")!.id).toBe("blue");
    expect(findNode(produce(), "kiwi")).toBeNull();
  });
  it("containsDescendant is strict (a node does not contain itself)", () => {
    const [fruit] = produce();
    expect(containsDescendant(fruit, "seed")).toBe(true);
    expect(containsDescendant(fruit, "fruit")).toBe(false);
    expect(containsDescendant(fruit, "carrot")).toBe(false);
  });
});

describe("flattenVisible", () => {
  it("descends only into expanded nodes, in document order, with depth", () => {
    const rows = flattenVisible(produce(), { fruit: true, berries: true });
    expect(ids(rows)).toEqual(["fruit", "apple", "banana", "berries", "straw", "blue", "veg"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 1, 2, 2, 0]);
    expect(rows.find((r) => r.node.id === "apple")!.hasChildren).toBe(true);
  });
  it("marks dividers as non-navigable", () => {
    const rows = flattenVisible([n("a"), n("d", undefined, { isDivider: true }), n("b")], {});
    expect(rows.map((r) => r.navigable)).toEqual([true, false, true]);
  });
  it("ignores expanded flags on leaves and on nodes with empty children", () => {
    expect(ids(flattenVisible([n("a", []), n("b")], { a: true, b: true }))).toEqual(["a", "b"]);
  });
});
