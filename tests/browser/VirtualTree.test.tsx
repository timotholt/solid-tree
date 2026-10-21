import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import { createSignal } from "solid-js";
import { VirtualTree } from "../../src/view/VirtualTree.js";
import { createTreeController, type TreeController } from "../../src/controller/index.js";
import type { TreeNodeData } from "../../src/types.js";
import { n, wide } from "../support/fixtures.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const settle = async () => {
  for (let i = 0; i < 4; i++) await frame();
};
const slots = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-index]"));
const rowsIn = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[role='treeitem']"));
const startOf = (slot: HTMLElement) => Number(/translateY\(([-\d.]+)px\)/.exec(slot.style.transform)![1]);

/** Every rendered slot (up to index `upTo`) starts exactly where the previous one ends. */
function expectContiguous(c: HTMLElement, upTo = Infinity) {
  const s = slots(c)
    .filter((x) => Number(x.dataset.index) <= upTo)
    .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
  for (let i = 1; i < s.length; i++) {
    if (Number(s[i].dataset.index) !== Number(s[i - 1].dataset.index) + 1) continue;
    expect(startOf(s[i])).toBeCloseTo(startOf(s[i - 1]) + s[i - 1].getBoundingClientRect().height, 0);
  }
}

function mount(data: TreeNodeData[], props: Record<string, unknown> = {}) {
  let tree!: TreeController;
  const view = render(() => {
    tree = createTreeController({ data: () => data });
    return <VirtualTree tree={tree} viewportStyle={{ height: "300px" }} ariaLabel="big" {...props} />;
  });
  return { ...view, tree };
}

describe("<VirtualTree>", () => {
  it("renders only a window of a large tree", async () => {
    const { container, tree } = mount(wide(10, 4)); // 11,110 nodes
    tree.expandAll();
    await settle();
    expect(tree.flatRows().length).toBeGreaterThan(10_000);
    expect(rowsIn(container).length).toBeLessThan(60);
  });

  it("scrolling renders later rows and keeps slots contiguous", async () => {
    const { container, tree } = mount(wide(10, 3));
    tree.expandAll();
    await settle();
    const viewport = container.querySelector<HTMLElement>(".solid-tree-viewport")!;
    viewport.scrollTop = 5000;
    await settle();
    const first = Number(slots(container)[0].dataset.index);
    expect(first).toBeGreaterThan(100);
    expectContiguous(container);
  });

  it("keyboard End focuses (and scrolls to) the last row", async () => {
    const { container, tree } = mount(wide(10, 3));
    tree.expandAll();
    await settle();
    rowsIn(container)[0].focus();
    await userEvent.keyboard("{End}");
    await settle();
    const last = tree.flatRows().at(-1)!.node.id;
    expect((document.activeElement as HTMLElement).dataset.treeId).toBe(last);
  });

  it("regression baseline (C2/#1203): measured heights survive expand/collapse", async () => {
    // Variable-height rows: every 3rd row is 64px tall, the rest use the default.
    const data = wide(6, 2);
    const { container, tree } = mount(data, {
      estimateSize: 20,
      renderLabel: (node: TreeNodeData) => (
        <span style={{ display: "block", height: Number(node.id.split(".").at(-1)) % 3 === 0 ? "64px" : "auto" }}>
          {node.id}
        </span>
      ),
    });
    await settle();
    expectContiguous(container);
    tree.expand("n.2");
    // Synchronously after the count change, already-measured rows above the expanded
    // node must keep their measured sizes (upstream measure() used to reset them).
    // Rows 0..2 were measured before the expand; row 3 is the first new child, whose
    // start must still equal the end of measured row 2.
    expectContiguous(container, 3);
    await settle();
    expectContiguous(container);
    tree.collapse("n.2");
    await settle();
    expectContiguous(container);
  });

  it("onRangeChange reports the visible window", async () => {
    const ranges: [number, number][] = [];
    const { tree } = mount(wide(10, 3), { onRangeChange: (a: number, b: number) => ranges.push([a, b]) });
    tree.expandAll();
    await settle();
    expect(ranges.at(-1)![0]).toBe(0);
    expect(ranges.at(-1)![1]).toBeGreaterThan(5);
  });
});

// ── Known defects ────────────────────────────────────────────────────────────────

it("regression(B1): a reused slot switches correctly between divider and row", async () => {
  const [data, setData] = createSignal<TreeNodeData[]>([n("a"), n("d", undefined, { isDivider: true, label: "" }), n("b")]);
  let tree!: TreeController;
  const { container } = render(() => {
    tree = createTreeController({ data });
    return <VirtualTree tree={tree} viewportStyle={{ height: "300px" }} />;
  });
  await settle();
  setData([n("a"), n("x"), n("b")]); // slot 1: divider → row
  await settle();
  expect(rowsIn(container).map((r) => r.dataset.treeId)).toEqual(["a", "x", "b"]);
});

// Rewritten for the new design (PLAN §5.3): when the remembered row is scrolled out of
// the virtual window, the tree root is the Tab stop and hands focus back to that row.
it("regression(E5): Tab returns to the focused row after it scrolled out of view", async () => {
  const { container, tree } = mount(wide(10, 3));
  tree.expandAll();
  await settle();
  const before = document.createElement("button");
  document.body.prepend(before);
  const target = rowsIn(container)[3];
  const id = target.dataset.treeId;
  target.focus();
  await settle(); // let focusRow's scrollToIndex finish re-aligning before we scroll away
  before.focus();
  container.querySelector<HTMLElement>(".solid-tree-viewport")!.scrollTop = 8000;
  await settle();
  expect(rowsIn(container).some((r) => r.dataset.treeId === id)).toBe(false); // really scrolled out
  await userEvent.tab();
  await settle();
  expect((document.activeElement as HTMLElement).dataset.treeId).toBe(id);
  before.remove();
});

it("replacing rows 1:1 (same count) renders the new rows (G3 retracted)", async () => {
  const [data, setData] = createSignal<TreeNodeData[]>([n("a"), n("b"), n("c")]);
  let tree!: TreeController;
  const { container } = render(() => {
    tree = createTreeController({ data });
    return <VirtualTree tree={tree} viewportStyle={{ height: "300px" }} />;
  });
  await settle();
  setData([n("x"), n("y"), n("z")]);
  await settle();
  expect(rowsIn(container).map((r) => r.dataset.treeId)).toEqual(["x", "y", "z"]);
});

describe("<VirtualTree> phase 4", () => {
  it("clicking a fully visible row does not scroll (E6)", async () => {
    const { container, tree } = mount(wide(10, 3));
    tree.expandAll();
    await settle();
    const vp = container.querySelector<HTMLElement>(".solid-tree-viewport")!;
    vp.scrollTop = 400;
    await settle();
    const before = vp.scrollTop;
    const row = rowsIn(container).find((r) => {
      const b = r.getBoundingClientRect();
      const v = vp.getBoundingClientRect();
      return b.top >= v.top && b.bottom <= v.bottom;
    })!;
    row.click();
    await settle();
    expect(vp.scrollTop).toBe(before);
  });

  it("scrollToId reveals and scrolls a far row into the window", async () => {
    const { container, tree } = mount(wide(10, 3));
    tree.scrollToId("n.9.9.9");
    await settle();
    await settle();
    expect(rowsIn(container).some((r) => r.dataset.treeId === "n.9.9.9")).toBe(true);
  });
});
