import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { QueryClient } from "@tanstack/solid-query";
import { Tree } from "../../src/view/Tree.js";
import { createTreeController, type TreeController } from "../../src/controller/index.js";
import { createDatabaseTreeController } from "../../src/database/createDatabaseTreeController.js";
import { createMemorySource } from "../../src/testing.js";
import { flush, inRoot } from "../support/root.js";
import { n, produce } from "../support/fixtures.js";

// APIs added from the gallery agents' feedback (phase 8).
const item = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-tree-id='${id}']`)!;
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("controller additions", () => {
  it("defaultExpandedIds opens nodes at creation (uncontrolled)", () => {
    const t = inRoot(() => createTreeController({ data: produce(), defaultExpandedIds: ["fruit"] }));
    expect(t.flatRows().map((r) => r.id)).toContain("apple");
    t.collapse("fruit"); // still uncontrolled
    expect(t.flatRows().map((r) => r.id)).not.toContain("apple");
  });

  it("onRename returning a string rejects with that reason", async () => {
    const onRenameError = vi.fn();
    const t = inRoot(() => createTreeController({ data: produce(), onRename: () => "name taken", onRenameError }));
    t.startEditing("veg");
    await t.commitEditing("Greens");
    expect(onRenameError.mock.calls[0][1]).toEqual(new Error("name taken"));
  });

  it("controllerRef hands out the controller a prop-driven view builds", () => {
    let tree: TreeController | undefined;
    render(() => <Tree data={produce()} ariaLabel="P" controllerRef={(t) => (tree = t)} />);
    tree!.expand("veg");
    expect(tree!.flatRows().map((r) => r.id)).toContain("carrot");
  });
});

describe("database additions", () => {
  it("onRemoteChange observes every realtime change", async () => {
    const source = createMemorySource(produce());
    const seen: string[] = [];
    const t = inRoot(() => createDatabaseTreeController({ source, queryClient: qc(), onRemoteChange: (c) => seen.push(c.type) }));
    await flush();
    source.insert(null, n("new"));
    source.remove("new");
    expect(seen).toEqual(["insert", "remove"]);
    t.dispose();
  });

  it("source.compare also orders fetched lists", async () => {
    const source = createMemorySource([n("b"), n("c"), n("a")]);
    source.compare = (x, y) => x.id.localeCompare(y.id);
    const t = inRoot(() => createDatabaseTreeController({ source, queryClient: qc() }));
    await flush();
    expect(t.flatRows().map((r) => r.id)).toEqual(["a", "b", "c"]);
    t.dispose();
  });

  it("failNext fails only the next load", async () => {
    const source = createMemorySource(produce());
    source.failNext("veg");
    await expect(source.getChildren!(n("veg"))).rejects.toThrow();
    await expect(source.getChildren!(n("veg"))).resolves.toHaveLength(1);
  });

  it("memory source move(before/after/inside) emits move changes and reorders", async () => {
    const source = createMemorySource(produce());
    const changes: string[] = [];
    source.subscribe!((c) => changes.push(c.type === "move" ? `${c.id}->${c.parentId}@${c.index}` : c.type));
    await source.move!(["veg"], "fruit", "before");
    await source.move!(["carrot"], "veg", "after");
    await source.move!(["banana"], "veg", "inside");
    expect(source.snapshot().map((x) => x.id)).toEqual(["veg", "carrot", "fruit"]);
    expect(changes).toEqual(["veg->null@0", "carrot->null@1", "banana->veg@undefined"]);
  });
});

describe("error rows", () => {
  const failing = async () => {
    const source = createMemorySource(produce());
    source.fail("veg");
    let tree!: ReturnType<typeof createDatabaseTreeController>;
    const view = render(() => {
      tree = createDatabaseTreeController({ source, queryClient: qc() });
      return <Tree tree={tree} ariaLabel="Remote" />;
    });
    await flush();
    tree.expand("veg");
    await flush();
    await flush();
    return { ...view, source, tree };
  };

  it("show the failure reason", async () => {
    const { container } = await failing();
    expect(container.querySelector(".solid-tree-error")!.textContent).toContain("load of veg failed");
  });

  it("Enter on the failed branch's parent retries (keyboard access)", async () => {
    const { container, source } = await failing();
    source.heal("veg");
    fireEvent.keyDown(item(container, "veg"), { key: "Enter" });
    await flush();
    await flush();
    expect(item(container, "carrot")).not.toBeNull();
  });

  it("clicking a roots error row retries the roots", async () => {
    const source = createMemorySource(produce());
    source.failNext("__roots");
    let tree!: ReturnType<typeof createDatabaseTreeController>;
    const { container } = render(() => {
      tree = createDatabaseTreeController({ source, queryClient: qc() });
      return <Tree tree={tree} ariaLabel="Remote" />;
    });
    await flush();
    await flush();
    const err = container.querySelector<HTMLElement>('[data-placeholder="error"] .solid-tree-item')!;
    expect(err).not.toBeNull();
    fireEvent.click(err);
    await flush();
    await flush();
    expect(item(container, "fruit")).not.toBeNull();
  });
});
