import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 1,
  title: "Quick start",
  description: "The smallest useful tree: nested data in, a selectable, keyboard-navigable tree out.",
  tags: ["basics"],
};

const data: TreeNodeData[] = [
  {
    id: "fruit",
    label: "Fruit",
    type: "group",
    children: [
      { id: "apple", label: "Apple", type: "item" },
      { id: "banana", label: "Banana", type: "item" },
    ],
  },
  { id: "veg", label: "Vegetables", type: "group", children: [{ id: "carrot", label: "Carrot", type: "item" }] },
];

export default function QuickStart() {
  return <Tree data={data} ariaLabel="Produce" onSelect={(node) => console.info("selected", node.id)} />;
}

export const check: ExampleCheck = async (root, h) => {
  h.expect(h.has("fruit")).toBe(true);
  await h.click("fruit"); // Finder-style: selects and expands
  h.expect(h.has("apple")).toBe(true);
  h.expect(h.row("fruit").getAttribute("aria-selected")).toBe("true");
  await h.key("fruit", "ArrowDown");
  h.expect(root.ownerDocument.activeElement).toBe(h.row("apple"));
};
