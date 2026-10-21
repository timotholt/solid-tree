import { createMemo, createSignal } from "solid-js";
import { VirtualTree, createTreeController, type TreeNodeData } from "@timotholt/solid-tree/virtual";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 8,
  title: "100,000 nodes",
  description:
    "<VirtualTree> windows a 100 × 1,000 tree (100,100 nodes): only the rows in view are in the DOM. Expand everything, then jump to any node with scrollToId.",
  tags: ["virtual", "performance", "scrollToId", "controller"],
};

const GROUPS = 100;
const PER_GROUP = 1000;

export default function HundredThousandNodes() {
  // Generated once, synchronously, the first time the tree reads it.
  const data = createMemo<TreeNodeData[]>(() =>
    Array.from({ length: GROUPS }, (_, g) => ({
      id: `g${g}`,
      label: `Group ${g}`,
      type: "group",
      count: PER_GROUP,
      children: Array.from({ length: PER_GROUP }, (_, i) => ({ id: `g${g}/n${i}`, label: `Node ${g}.${i}`, type: "item" })),
    }))
  );
  const total = () => data().reduce((n, g) => n + 1 + (g.children?.length ?? 0), 0);

  // An external controller gives us expandAll / scrollToId / flatRows.
  const tree = createTreeController({ data });
  const [rendered, setRendered] = createSignal(0);
  const [target, setTarget] = createSignal("g99/n999");
  const [message, setMessage] = createSignal("");

  const jump = (e: SubmitEvent) => {
    e.preventDefault();
    const id = target().trim();
    if (!tree.index().get(id)) return setMessage(`No node "${id}"`);
    tree.select(id);
    tree.scrollToId(id); // expands its ancestors, then scrolls the window to it
    setMessage(`Jumped to ${id}`);
  };

  return (
    <div>
      <div class="toolbar">
        <button type="button" onClick={() => tree.expandAll()}>
          Expand all
        </button>
        <button type="button" onClick={() => tree.collapseAll()}>
          Collapse all
        </button>
        <form onSubmit={jump} style={{ display: "flex", gap: "6px" }}>
          <label>
            Jump to id{" "}
            <input data-testid="jump" value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder="g42/n500" />
          </label>
          <button type="submit">Jump</button>
        </form>
      </div>
      <p class="muted" aria-live="polite">
        <span data-testid="rendered">{rendered()}</span> rows rendered of <span data-testid="visible">{tree.flatRows().length}</span>{" "}
        visible / {total().toLocaleString()} total. {message()}
      </p>
      <VirtualTree
        tree={tree}
        ariaLabel="One hundred thousand nodes"
        viewportStyle={{ height: "360px", border: "1px solid var(--border-subtle)", "border-radius": "8px" }}
        onRangeChange={(start, end) => setRendered(end - start + 1)}
      />
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const button = (name: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
  const domRows = () => root.querySelectorAll('[role="treeitem"]').length;

  h.expect(h.has("g0")).toBe(true);
  await h.click(button("Expand all"));
  await h.settle(50);
  h.expect(Number(root.querySelector('[data-testid="visible"]')!.textContent)).toBe(100_100);
  h.expect(domRows()).toBeGreaterThan(0);
  h.expect(domRows()).toBeLessThan(200); // windowed: a tiny slice of 100,100 rows

  await h.type(root.querySelector<HTMLInputElement>('[data-testid="jump"]')!, "g87/n654");
  root.querySelector("form")!.requestSubmit();
  // The virtualizer scrolls over a few frames; wait for the row rather than a fixed delay.
  for (let i = 0; i < 40 && !h.has("g87/n654"); i++) await h.settle(50);
  h.expect(h.has("g87/n654")).toBe(true);
  h.expect(h.row("g87/n654").getAttribute("aria-selected")).toBe("true");
  h.expect(h.has("g0")).toBe(false); // scrolled far away from the top
  h.expect(domRows()).toBeLessThan(200);
};
