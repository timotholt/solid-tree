import { createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 2,
  title: "File explorer",
  description:
    "Icons, counts and remembered expansion (storageKey). Toggle between a controlled selection (the app owns it) and an uncontrolled one (the tree owns it). Enter or double-click opens a file (onActivate).",
  tags: ["icons", "persistence", "controlled", "onActivate"],
};

const files: TreeNodeData[] = [
  {
    id: "src",
    label: "src",
    type: "dir",
    iconLeft: "📁",
    count: 3,
    children: [
      { id: "src/index.ts", label: "index.ts", type: "file", iconLeft: "📄" },
      { id: "src/tree.tsx", label: "tree.tsx", type: "file", iconLeft: "📄" },
      {
        id: "src/core",
        label: "core",
        type: "dir",
        iconLeft: "📁",
        children: [{ id: "src/core/index.ts", label: "index.ts", type: "file", iconLeft: "📄" }],
      },
    ],
  },
  { id: "README.md", label: "README.md", type: "file", iconLeft: "📝" },
  { id: "package.json", label: "package.json", type: "file", iconLeft: "📦" },
];

export default function FileExplorer() {
  const [controlled, setControlled] = createSignal(true);
  const [selected, setSelected] = createSignal<string | null>("README.md");
  const [opened, setOpened] = createSignal("");

  return (
    <div class="split">
      <div>
        <div class="toolbar">
          <label>
            <input type="checkbox" checked={controlled()} onChange={(e) => setControlled(e.currentTarget.checked)} /> controlled
            selection
          </label>
        </div>
        {/* Two trees so each mode is visible; `selectedId` passed ⇒ controlled. */}
        {controlled() ? (
          <Tree
            data={files}
            ariaLabel="Files"
            storageKey="example-explorer"
            selectedId={selected()}
            onSelect={(n) => setSelected(n.id)}
            onActivate={(n) => n.type === "file" && setOpened(n.id)}
          />
        ) : (
          <Tree data={files} ariaLabel="Files" storageKey="example-explorer" onActivate={(n) => n.type === "file" && setOpened(n.id)} />
        )}
      </div>
      <div class="panel" aria-live="polite">
        <p class="muted">App state</p>
        <p>
          selected: <code data-testid="selected">{controlled() ? selected() ?? "none" : "(owned by the tree)"}</code>
        </p>
        <p>
          opened: <code data-testid="opened">{opened() || "nothing yet — press Enter on a file"}</code>
        </p>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const text = (id: string) => root.querySelector(`[data-testid="${id}"]`)!.textContent;
  h.expect(h.row("README.md").getAttribute("aria-selected")).toBe("true");
  await h.click("package.json");
  h.expect(text("selected")).toBe("package.json");
  await h.key("package.json", "Enter");
  h.expect(text("opened")).toBe("package.json");
  await h.click("src");
  h.expect(h.has("src/core")).toBe(true);
  // The expansion was remembered under storageKey.
  h.expect(localStorage.getItem("tree-example-explorer")).toContain("src");
};
