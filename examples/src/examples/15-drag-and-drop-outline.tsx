import { For, createSignal } from "solid-js";
import { Tree, moveNodes, type TreeNodeData } from "@timotholt/solid-tree";
import type { DropPosition } from "@timotholt/solid-tree/headless";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 15,
  title: "Drag-and-drop outline",
  description:
    "Reorder an outline by dragging rows or with Ctrl+Shift+Arrows. onMove stores the result of moveNodes(); canMove keeps the read-only Archive closed both ways, and the tree itself refuses to move a node into its own subtree.",
  tags: ["drag-and-drop", "moves", "keyboard", "moveNodes"],
};

const initial: TreeNodeData[] = [
  {
    id: "plan",
    label: "Launch plan",
    type: "note",
    children: [
      { id: "draft", label: "Draft announcement", type: "note" },
      { id: "review", label: "Legal review", type: "note" },
      { id: "ship", label: "Ship it", type: "note" },
    ],
  },
  { id: "archive", label: "Archive (read-only)", type: "note", children: [{ id: "archive/2023", label: "2023 retro", type: "note" }] },
  { id: "ideas", label: "Loose ideas", type: "note" },
];

const archived = (id: string) => id.startsWith("archive/");
const where: Record<DropPosition, string> = { before: "before", after: "after", inside: "into" };

export default function DragAndDropOutline() {
  const [notes, setNotes] = createSignal(initial);
  const [expanded, setExpanded] = createSignal<string[]>(["plan", "archive"]);
  const [log, setLog] = createSignal<string[]>([]);
  const labelOf = (id: string): string => {
    const find = (ns: TreeNodeData[]): TreeNodeData | undefined => {
      for (const n of ns) {
        const hit = n.id === id ? n : n.children && find(n.children);
        if (hit) return hit;
      }
    };
    return find(notes())?.label ?? id;
  };

  return (
    <div class="split">
      <Tree
        data={notes()}
        ariaLabel="Outline"
        expandedIds={expanded()}
        onExpandedChange={setExpanded}
        // Nothing enters or leaves the archive (the folder itself may still be reordered).
        canMove={(sources, target, position) =>
          !sources.some(archived) && !archived(target) && !(target === "archive" && position === "inside")
        }
        onMove={(sources, target, position) => {
          setLog((l) => [`${sources.map(labelOf).join(", ")} → ${where[position]} ${labelOf(target)}`, ...l]);
          setNotes((d) => moveNodes(d, sources, target, position));
        }}
      />
      <div class="panel">
        <p class="muted">
          Drag a row onto the top, middle or bottom of another row. By keyboard: Ctrl+Shift+↑/↓ moves past a sibling,
          Ctrl+Shift+← moves out of the parent, Ctrl+Shift+→ moves into the previous sibling.
        </p>
        <p>Moves:</p>
        <ol data-testid="log" aria-live="polite">
          <For each={log()} fallback={<li>none yet</li>}>
            {(entry) => <li>{entry}</li>}
          </For>
        </ol>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const order = () => Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]')).map((el) => el.dataset.treeId);
  const moves = () => root.querySelectorAll('[data-testid="log"] li').length;
  const chord = { ctrlKey: true, shiftKey: true };

  await h.key("review", "ArrowUp", chord); // before "Draft announcement"
  await h.settle();
  h.expect(order()).toEqual(["plan", "review", "draft", "ship", "archive", "archive/2023", "ideas"]);
  h.expect(root.ownerDocument.activeElement).toBe(h.row("review"));

  await h.key("ship", "ArrowLeft", chord); // out of the plan, after it
  await h.settle();
  // Same visual order (it was the last child), but now a top-level note.
  h.expect(order()).toEqual(["plan", "review", "draft", "ship", "archive", "archive/2023", "ideas"]);
  h.expect(h.row("ship").getAttribute("aria-level")).toBe("1");
  h.expect(h.row("draft").getAttribute("aria-level")).toBe("2");

  // Forbidden: into the archive (previous sibling of "ideas"), and out of it.
  const before = order();
  await h.key("ideas", "ArrowRight", chord);
  await h.key("archive/2023", "ArrowLeft", chord);
  await h.settle();
  h.expect(order()).toEqual(before);
  h.expect(moves()).toBe(2);
};
