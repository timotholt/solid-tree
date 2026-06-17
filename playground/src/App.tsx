import { createSignal, type Component } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/tree";
import "@timotholt/tree/theme.css";

const data: TreeNodeData[] = [
  {
    id: "fruit",
    label: "Fruit",
    type: "group",
    iconLeft: "🍎",
    children: [
      { id: "apple", label: "Apple", type: "item", count: 3 },
      { id: "banana", label: "Banana", type: "item", iconRight: "⭐" },
      {
        id: "berries",
        label: "Berries",
        type: "group",
        children: [
          { id: "straw", label: "Strawberry", type: "item" },
          { id: "blue", label: "Blueberry", type: "item", count: 12 },
        ],
      },
    ],
  },
  { id: "div1", label: "", type: "divider", isDivider: true },
  {
    id: "veg",
    label: "Vegetables",
    type: "group",
    iconLeft: "🥕",
    children: [
      { id: "carrot", label: "Carrot", type: "item" },
      { id: "pea", label: "Pea", type: "item", status: "new" },
    ],
  },
  { id: "add", label: "+ Add category", type: "add", variant: "action" },
];

export const App: Component = () => {
  const [selectedId, setSelectedId] = createSignal<string | null>("apple");

  return (
    <>
      <Tree
        data={data}
        selectedId={selectedId()}
        storageKey="playground"
        onSelect={(n) => setSelectedId(n.id)}
        renderActionNode={(n) =>
          n.status === "new" ? <span class="badge">new</span> : null
        }
      />
      <div class="selected-out">selected: {selectedId() ?? "(none)"}</div>
    </>
  );
};
