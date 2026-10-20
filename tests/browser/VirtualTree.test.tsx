import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import { createSignal } from "solid-js";
import { VirtualTree } from "../../src/VirtualTree.jsx";
import { createTreeController, type TreeController } from "../../src/controller.js";
import type { TreeNodeData } from "../../src/types.js";
import { knownDefect } from "../support/known-defect.js";
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

knownDefect("B1", "a reused slot switches correctly between divider and row", async () => {
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

knownDefect("E5", "Tab returns to the focused row after it scrolled out of view", async () => {
  const { container, tree } = mount(wide(10, 3));
  tree.expandAll();
  await settle();
  const target = rowsIn(container)[3];
  const id = target.dataset.treeId;
  target.focus();
  target.blur();
  await settle(); // let focusRow's scrollToIndex finish re-aligning before we scroll away
  container.querySelector<HTMLElement>(".solid-tree-viewport")!.scrollTop = 8000;
  await settle();
  const tabbable = rowsIn(container).find((r) => r.tabIndex === 0);
  expect(tabbable?.dataset.treeId ?? "(not rendered)").toBe(id);
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
