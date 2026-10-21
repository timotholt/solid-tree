import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { QueryClient } from "@tanstack/solid-query";
import { Tree } from "../../src/view/Tree.js";
import { createTreeController } from "../../src/controller/index.js";
import { createDatabaseTreeController } from "../../src/database/createDatabaseTreeController.js";
import { moveNodes } from "../../src/moveNodes.js";
import { createMemorySource } from "../../src/testing.js";
import type { TreeNodeData } from "../../src/types.js";
import { flush, inRoot } from "../support/root.js";
import { n, produce } from "../support/fixtures.js";

const item = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-tree-id='${id}']`)!;
const label = (c: HTMLElement, id: string) => item(c, id).querySelector(".solid-tree-label")!.textContent;

describe("7.2 rename — controller", () => {
  it("is off without onRename; disabled and vetoed nodes never rename", () => {
    const t = inRoot(() => createTreeController({ data: [n("a"), n("b", undefined, { disabled: true }), n("c")] }));
    t.startEditing("a");
    expect(t.editingId()).toBeNull();
    const u = inRoot(() => createTreeController({ data: [n("a"), n("b", undefined, { disabled: true }), n("c")], onRename: () => true, canRename: (x) => x.id !== "c" }));
    u.startEditing("b");
    u.startEditing("c");
    expect(u.editingId()).toBeNull();
    u.startEditing("a");
    expect(u.editingId()).toBe("a");
  });

  it("shows the new label optimistically, then the data wins", async () => {
    let resolve!: (v: boolean) => void;
    const onRename = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const t = inRoot(() => createTreeController({ data: produce(), onRename }));
    t.startEditing("veg");
    const done = t.commitEditing("Greens");
    expect(t.pendingLabel("veg")).toBe("Greens");
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: "veg" }), "Greens");
    resolve(true);
    await done;
    expect(t.pendingLabel("veg")).toBeUndefined(); // app did not update data → old label shows
  });

  it("rolls back and reports on rejection or false", async () => {
    const onRenameError = vi.fn();
    const t = inRoot(() => createTreeController({ data: produce(), onRename: () => Promise.reject(new Error("taken")), onRenameError }));
    t.startEditing("veg");
    await t.commitEditing("Greens");
    expect(t.pendingLabel("veg")).toBeUndefined();
    expect(onRenameError).toHaveBeenCalledWith(expect.objectContaining({ id: "veg" }), expect.any(Error));
  });

  it("empty or unchanged values cancel without calling onRename", async () => {
    const onRename = vi.fn();
    const t = inRoot(() => createTreeController({ data: produce(), onRename }));
    t.startEditing("veg");
    await t.commitEditing("   ");
    t.startEditing("veg");
    await t.commitEditing("Vegetables");
    expect(onRename).not.toHaveBeenCalled();
  });
});

describe("7.2 rename — view", () => {
  const setup = (extra: Record<string, unknown> = {}) => {
    const [data, setData] = createSignal(produce());
    const onRename = vi.fn((node: TreeNodeData, value: string) => {
      setData((d) => d.map((x) => (x.id === node.id ? { ...x, label: value } : x)));
      return true;
    });
    const view = render(() => <Tree data={data()} onRename={onRename} {...extra} />);
    return { ...view, onRename };
  };

  it("F2 opens an input with the label; Enter commits and focus returns to the row", async () => {
    const { container, onRename } = setup();
    item(container, "veg").focus();
    fireEvent.keyDown(item(container, "veg"), { key: "F2" });
    const input = item(container, "veg").querySelector("input")!;
    expect(input.value).toBe("Vegetables");
    expect(input.getAttribute("aria-label")).toBe("Rename Vegetables");
    fireEvent.input(input, { target: { value: "Greens" } });
    input.value = "Greens";
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect(onRename).toHaveBeenCalled();
    expect(label(container, "veg")).toBe("Greens");
    await flush();
    expect(document.activeElement).toBe(item(container, "veg"));
  });

  it("Escape cancels; typing in the input does not drive tree keys", async () => {
    const { container, onRename } = setup();
    fireEvent.keyDown(item(container, "veg"), { key: "F2" });
    const input = item(container, "veg").querySelector("input")!;
    fireEvent.keyDown(input, { key: "ArrowRight" }); // would expand veg if it leaked
    expect(item(container, "veg").getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "Escape" });
    await flush();
    expect(item(container, "veg").querySelector("input")).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("blur commits by default and cancels with renameOnBlur='cancel'", async () => {
    const a = setup();
    fireEvent.keyDown(item(a.container, "veg"), { key: "F2" });
    const input = item(a.container, "veg").querySelector("input")!;
    input.value = "Greens";
    fireEvent.blur(input);
    await flush();
    expect(a.onRename).toHaveBeenCalled();
    a.unmount();
    const b = setup({ renameOnBlur: "cancel" });
    fireEvent.keyDown(item(b.container, "veg"), { key: "F2" });
    const input2 = item(b.container, "veg").querySelector("input")!;
    input2.value = "Greens";
    fireEvent.blur(input2);
    await flush();
    expect(b.onRename).not.toHaveBeenCalled();
  });
});

describe("7.3 checkboxes", () => {
  it("aria-checked on the treeitem; Space toggles; cascade marks parents mixed", () => {
    const onCheckedChange = vi.fn();
    const { container } = render(() => <Tree data={produce()} checkable expandedIds={["fruit", "berries"]} onCheckedChange={onCheckedChange} />);
    expect(item(container, "straw").getAttribute("aria-checked")).toBe("false");
    fireEvent.keyDown(item(container, "straw"), { key: " " });
    expect(item(container, "straw").getAttribute("aria-checked")).toBe("true");
    expect(item(container, "berries").getAttribute("aria-checked")).toBe("mixed");
    expect(item(container, "fruit").getAttribute("aria-checked")).toBe("mixed");
    expect(onCheckedChange).toHaveBeenLastCalledWith(["straw"]);
    // Space toggles the check and does NOT select
    expect(item(container, "straw").getAttribute("aria-selected")).toBe("false");
  });

  it("clicking the glyph toggles without selecting; a checkable predicate limits it", () => {
    const { container } = render(() => <Tree data={produce()} checkable={(x) => x.id !== "veg"} />);
    fireEvent.click(item(container, "fruit").querySelector(".solid-tree-check")!);
    expect(item(container, "fruit").getAttribute("aria-checked")).toBe("true");
    expect(item(container, "fruit").getAttribute("aria-selected")).toBe("false");
    expect(item(container, "veg").hasAttribute("aria-checked")).toBe(false);
    expect(item(container, "veg").querySelector(".solid-tree-check")).toBeNull();
  });

  it("strict mode and controlled checkedIds", () => {
    const { container } = render(() => <Tree data={produce()} checkable checkMode="strict" checkedIds={["fruit"]} expandedIds={["fruit"]} />);
    expect(item(container, "fruit").getAttribute("aria-checked")).toBe("true");
    expect(item(container, "apple").getAttribute("aria-checked")).toBe("false");
  });

  it("database tier: an unloaded branch keeps its explicit value (never mixed)", async () => {
    const source = createMemorySource(produce());
    const t = inRoot(() => createDatabaseTreeController({ source, queryClient: new QueryClient(), checkable: true }));
    await flush();
    t.toggleChecked("fruit"); // children not loaded
    expect(t.checkState("fruit")).toBe("checked");
    t.dispose();
  });
});

describe("7.4 moves — controller and keyboard", () => {
  it("moveNodes helper produces the moved data", () => {
    const out = moveNodes(produce(), ["carrot"], "apple", "after");
    expect(out[0].children!.map((x) => x.id)).toEqual(["apple", "carrot", "banana", "berries"]);
  });

  it("move is optimistic until onMove settles; rejection rolls back", async () => {
    let settle!: (v: boolean) => void;
    const t = inRoot(() => createTreeController({ data: produce(), onMove: () => new Promise<boolean>((r) => (settle = r)) }));
    const p = t.move(["veg"], "fruit", "before");
    expect(t.index().roots).toEqual(["veg", "fruit"]);
    settle(false);
    expect(await p).toBe(false);
    expect(t.index().roots).toEqual(["fruit", "veg"]);
  });

  it("canMove vetoes and structural impossibilities are rejected", async () => {
    const onMove = vi.fn();
    const t = inRoot(() => createTreeController({ data: produce(), onMove, canMove: (_s, target) => target !== "veg" }));
    expect(await t.move(["fruit"], "seed", "inside")).toBe(false); // into own subtree
    expect(await t.move(["fruit"], "veg", "after")).toBe(false); // vetoed
    expect(onMove).not.toHaveBeenCalled();
    expect(t.movesEnabled()).toBe(true);
  });

  it("Ctrl+Shift+Arrows move the focused row and announce it", async () => {
    const [data, setData] = createSignal(produce());
    const { container } = render(() => (
      <Tree data={data()} expandedIds={["fruit"]} onMove={(s, tg, p) => void setData(moveNodes(data(), s, tg, p))} />
    ));
    const live = () => container.querySelector("[role=status]")!.textContent;
    fireEvent.keyDown(item(container, "banana"), { key: "ArrowUp", ctrlKey: true, shiftKey: true });
    await flush();
    expect(data()[0].children!.map((x) => x.id)).toEqual(["banana", "apple", "berries"]);
    expect(live()).toBe("Moved banana before apple");
    fireEvent.keyDown(item(container, "banana"), { key: "ArrowLeft", ctrlKey: true, shiftKey: true });
    await flush();
    expect(data().map((x) => x.id)).toEqual(["fruit", "banana", "veg"]);
    fireEvent.keyDown(item(container, "banana"), { key: "ArrowRight", ctrlKey: true, shiftKey: true });
    await flush();
    expect(data()[0].children!.map((x) => x.id)).toEqual(["apple", "berries", "banana"]);
  });

  it("database tier uses source.move when no onMove is given", async () => {
    const source = createMemorySource(produce());
    const t = inRoot(() => createDatabaseTreeController({ source, queryClient: new QueryClient() }));
    await flush();
    expect(t.movesEnabled()).toBe(true);
    expect(await t.move(["veg"], "fruit", "before")).toBe(true);
    await flush();
    expect(t.index().roots).toEqual(["veg", "fruit"]);
    t.dispose();
  });
});
