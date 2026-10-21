import { createSignal } from "solid-js";
import { Tree, createTreeController, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 13,
  title: "Inline rename",
  description:
    "F2 (or the Rename button, via controller.startEditing) edits a label in place; Enter commits, Escape cancels. onRename validates asynchronously — duplicates among siblings and names containing “/” are rejected — the new label shows optimistically and rolls back on failure, and onRenameError reports why.",
  tags: ["rename", "async", "controller", "keyboard"],
};

const initial: TreeNodeData[] = [
  {
    id: "docs",
    label: "docs",
    type: "dir",
    iconLeft: "📁",
    children: [
      { id: "readme", label: "readme.md", type: "file", iconLeft: "📝" },
      { id: "notes", label: "notes.txt", type: "file", iconLeft: "📄" },
    ],
  },
  { id: "license", label: "LICENSE", type: "file", iconLeft: "🔒" },
];

const relabel = (nodes: TreeNodeData[], id: string, label: string): TreeNodeData[] =>
  nodes.map((n) => (n.id === id ? { ...n, label } : n.children ? { ...n, children: relabel(n.children, id, label) } : n));

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function InlineRename() {
  const [files, setFiles] = createSignal(initial);
  const [expanded, setExpanded] = createSignal<string[]>(["docs"]);
  const [blur, setBlur] = createSignal<"commit" | "cancel">("commit");
  const [error, setError] = createSignal("");

  // A controller (instead of props) so the toolbar can call tree.startEditing.
  const tree = createTreeController({
    data: files,
    get expandedIds() {
      return expanded();
    },
    onExpandedChange: setExpanded,
    canRename: (node) => node.id !== "license", // LICENSE is locked
    get renameOnBlur() {
      return blur();
    },
    onRename: async (node, name) => {
      setError("");
      await pause(30); // pretend to ask a server
      if (name.includes("/")) throw new Error("names cannot contain “/”");
      const idx = tree.index();
      if (idx.siblingsOf(node.id).some((s) => s !== node.id && idx.get(s)?.label === name)) {
        throw new Error(`“${name}” already exists here`);
      }
      setFiles((d) => relabel(d, node.id, name));
    },
    onRenameError: (node, e) => setError(`Could not rename ${node.label}: ${e instanceof Error ? e.message : String(e)}`),
  });

  const selected = () => tree.selectedId();

  return (
    <div class="split">
      <div>
        <div class="toolbar">
          <button
            type="button"
            disabled={!selected() || !tree.canRenameNode(selected()!)}
            onClick={() => tree.startEditing(selected()!)}
          >
            Rename
          </button>
          <label>
            On blur{" "}
            <select value={blur()} onChange={(e) => setBlur(e.currentTarget.value as "commit" | "cancel")}>
              <option value="commit">commit</option>
              <option value="cancel">cancel</option>
            </select>
          </label>
        </div>
        <Tree tree={tree} ariaLabel="Project files" />
      </div>
      <div class="panel">
        <p class="muted">Select a file and press F2, or use the Rename button. LICENSE cannot be renamed.</p>
        <p role="status" data-testid="error" style={{ color: "#b42318" }}>
          {error()}
        </p>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const input = () => root.querySelector<HTMLInputElement>("input.solid-tree-rename");
  const rename = async (text: string, key = "Enter") => {
    h.expect(input()).not.toBeNull();
    await h.type(input()!, text);
    await h.key(input()!, key);
    await h.settle(80); // the async validation
  };

  await h.click("notes");
  await h.key("notes", "F2");
  await rename("ideas.txt");
  h.expect(input()).toBeNull();
  h.expect(h.row("notes").textContent).toContain("ideas.txt");

  // A duplicate sibling name is rejected: error shown, label rolled back.
  await h.key("notes", "F2");
  await rename("readme.md");
  h.expect(root.querySelector('[data-testid="error"]')!.textContent).toContain("already exists");
  h.expect(h.row("notes").textContent).toContain("ideas.txt");

  // The toolbar button opens the editor too; Escape cancels it.
  const button = Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Rename")!;
  await h.click(button);
  await rename("ignored.txt", "Escape");
  h.expect(h.row("notes").textContent).toContain("ideas.txt");

  // Locked rows never enter edit mode.
  await h.click("license");
  await h.key("license", "F2");
  h.expect(input()).toBeNull();
};
