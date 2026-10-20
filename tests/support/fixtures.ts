import type { TreeNodeData } from "../../src/types.js";

export const n = (id: string, children?: TreeNodeData[], extra: Partial<TreeNodeData> = {}): TreeNodeData => ({
  id,
  label: extra.label ?? id,
  type: "test",
  ...(children ? { children } : {}),
  ...extra,
});

/**
 * fruit
 *   apple
 *     seed
 *   banana
 *   berries
 *     straw
 *     blue
 * veg
 *   carrot
 */
export const produce = (): TreeNodeData[] => [
  n("fruit", [n("apple", [n("seed")]), n("banana"), n("berries", [n("straw"), n("blue")])], { label: "Fruit" }),
  n("veg", [n("carrot")], { label: "Vegetables" }),
];

/** A balanced tree with `breadth^depth`-ish nodes; ids are dotted paths. */
export function wide(breadth: number, depth: number, prefix = "n"): TreeNodeData[] {
  if (depth === 0) return [];
  return Array.from({ length: breadth }, (_, i) => {
    const id = `${prefix}.${i}`;
    const kids = wide(breadth, depth - 1, id);
    return n(id, kids.length ? kids : undefined);
  });
}
