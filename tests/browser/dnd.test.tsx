import { describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import axe from "axe-core";
import { Tree } from "../../src/view/Tree.js";
import { VirtualTree } from "../../src/view/VirtualTree.js";
import { moveNodes } from "../../src/moveNodes.js";
import type { TreeNodeData } from "../../src/types.js";
import { produce, wide } from "../support/fixtures.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const settle = async (n = 4) => {
  for (let i = 0; i < n; i++) await frame();
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const el = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-tree-id='${id}']`)!;
const wrap = (c: HTMLElement, id: string) => el(c, id).closest<HTMLElement>(".solid-tree-row")!;

/** A point inside a row: frac 0 = top edge, 1 = bottom edge. */
const at = (target: HTMLElement, frac: number) => {
  const r = target.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * frac };
};
const pe = (type: string, p: { x: number; y: number }, extra: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, pointerId: 1, button: 0, pointerType: "mouse", isPrimary: true, ...extra });

async function drag(c: HTMLElement, fromId: string, toId: string, frac: number, opts: { release?: boolean } = {}) {
  const from = el(c, fromId);
  const start = at(from, 0.5);
  from.dispatchEvent(pe("pointerdown", start));
  window.dispatchEvent(pe("pointermove", { x: start.x, y: start.y + 8 }));
  await frame();
  const end = at(el(c, toId), frac);
  window.dispatchEvent(pe("pointermove", end));
  await frame();
  if (opts.release !== false) {
    window.dispatchEvent(pe("pointerup", end));
    await settle();
  }
}

function mountTree(extra: Record<string, unknown> = {}) {
  const [data, setData] = createSignal<TreeNodeData[]>(produce());
  const onMove = vi.fn((s: string[], t: string, p: "before" | "after" | "inside") => void setData(moveNodes(data(), s, t, p)));
  const view = render(() => <Tree data={data()} expandedIds={["fruit"]} onMove={onMove} {...extra} />);
  return { ...view, data, onMove };
}

describe("pointer drag-and-drop", () => {
  it("drops after (bottom zone), before (top zone) and inside (middle)", async () => {
    const t = mountTree();
    await drag(t.container, "apple", "banana", 0.9);
    expect(t.onMove).toHaveBeenLastCalledWith(["apple"], "banana", "after");
    await drag(t.container, "veg", "fruit", 0.05);
    expect(t.onMove).toHaveBeenLastCalledWith(["veg"], "fruit", "before");
    await drag(t.container, "banana", "veg", 0.5);
    expect(t.onMove).toHaveBeenLastCalledWith(["banana"], "veg", "inside");
    expect(t.data().find((x) => x.id === "veg")!.children!.map((x) => x.id)).toContain("banana");
  });

  it("shows the indicator while dragging and marks the dragged row", async () => {
    const t = mountTree();
    await drag(t.container, "apple", "banana", 0.9, { release: false });
    expect(wrap(t.container, "banana").dataset.drop).toBe("after");
    expect(wrap(t.container, "apple").hasAttribute("data-dragging")).toBe(true);
    expect(wrap(t.container, "banana").style.boxShadow).not.toBe("");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    expect(wrap(t.container, "banana").dataset.drop).toBeUndefined();
    window.dispatchEvent(pe("pointerup", at(el(t.container, "banana"), 0.9)));
    await settle();
    expect(t.onMove).not.toHaveBeenCalled(); // Escape cancelled
  });

  it("never offers an impossible drop (into its own subtree)", async () => {
    const t = mountTree();
    await drag(t.container, "fruit", "apple", 0.5, { release: false });
    expect(wrap(t.container, "apple").dataset.drop).toBeUndefined();
    window.dispatchEvent(pe("pointerup", at(el(t.container, "apple"), 0.5)));
    await settle();
    expect(t.onMove).not.toHaveBeenCalled();
  });

  it("a small jitter is a click, not a drag; the click after a drag does not select", async () => {
    const onSelect = vi.fn();
    const t = mountTree({ onSelect });
    const p = at(el(t.container, "banana"), 0.5);
    el(t.container, "banana").dispatchEvent(pe("pointerdown", p));
    window.dispatchEvent(pe("pointermove", { x: p.x + 2, y: p.y + 2 }));
    window.dispatchEvent(pe("pointerup", p));
    el(t.container, "banana").click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(t.onMove).not.toHaveBeenCalled();
    onSelect.mockClear();
    await drag(t.container, "apple", "banana", 0.9, { release: false });
    const end = at(el(t.container, "banana"), 0.9);
    // Browsers fire the click in the same task as pointerup, on the pressed element.
    window.dispatchEvent(pe("pointerup", end));
    el(t.container, "apple").click();
    expect(onSelect).not.toHaveBeenCalled();
    await settle();
  });

  it("touch: a long press starts the drag; moving first is a scroll", async () => {
    const t = mountTree();
    const p = at(el(t.container, "apple"), 0.5);
    const touch = { pointerType: "touch" as const };
    el(t.container, "apple").dispatchEvent(pe("pointerdown", p, touch));
    window.dispatchEvent(pe("pointermove", { x: p.x, y: p.y + 20 }, touch)); // scroll gesture
    await sleep(450);
    window.dispatchEvent(pe("pointerup", p, touch));
    expect(t.onMove).not.toHaveBeenCalled();
    el(t.container, "apple").dispatchEvent(pe("pointerdown", p, touch));
    await sleep(450);
    const end = at(el(t.container, "banana"), 0.9);
    window.dispatchEvent(pe("pointermove", end, touch));
    window.dispatchEvent(pe("pointerup", end, touch));
    await settle();
    expect(t.onMove).toHaveBeenCalledWith(["apple"], "banana", "after");
  });

  it("multi-select: dragging a selected row moves the whole selection", async () => {
    const t = mountTree({ selectionMode: "multiple", selectedIds: ["apple", "banana"] });
    await drag(t.container, "banana", "veg", 0.5);
    expect(t.onMove).toHaveBeenLastCalledWith(["apple", "banana"], "veg", "inside");
  });
});

describe("hover-expand (uncontrolled)", () => {
  it("opens a collapsed parent hovered in its middle zone", async () => {
    const [data] = createSignal<TreeNodeData[]>(produce());
    const onMove = vi.fn();
    const { container } = render(() => <Tree data={data()} onMove={onMove} />);
    await drag(container, "fruit", "veg", 0.5, { release: false });
    await sleep(700);
    await settle();
    expect(el(container, "veg").getAttribute("aria-expanded")).toBe("true");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
});

describe("drag in <VirtualTree>", () => {
  it("auto-scrolls near the bottom edge and keeps a valid target", async () => {
    const onMove = vi.fn();
    const { container } = render(() => <VirtualTree data={wide(10, 3)} onMove={onMove} viewportStyle={{ height: "240px" }} />);
    const vp = container.querySelector<HTMLElement>(".solid-tree-viewport")!;
    // Expand via keyboard "*" on the first row so there is something to scroll.
    const first = el(container, "n.0");
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "*", bubbles: true }));
    await settle();
    const start = at(first, 0.5);
    first.dispatchEvent(pe("pointerdown", start));
    window.dispatchEvent(pe("pointermove", { x: start.x, y: start.y + 8 }));
    const r = vp.getBoundingClientRect();
    window.dispatchEvent(pe("pointermove", { x: start.x, y: r.bottom - 4 }));
    await sleep(300);
    expect(vp.scrollTop).toBeGreaterThan(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
  });
});

describe("axe: feature states", () => {
  it("checkboxes, rename input and an active drag", async () => {
    const t = mountTree({ checkable: true, onRename: () => true, checkedIds: ["apple"] });
    el(t.container, "veg").dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    await settle();
    expect(el(t.container, "veg").querySelector("input")).not.toBeNull();
    await drag(t.container, "apple", "banana", 0.9, { release: false });
    const result = await axe.run(t.container, { resultTypes: ["violations"], rules: { "nested-interactive": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
});
