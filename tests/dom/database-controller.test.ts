import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { QueryClient } from "@tanstack/solid-query";
import { createDatabaseTreeController, LOADING_TYPE } from "../../src/database/createDatabaseTreeController.js";
import { fakeSource } from "../support/fake-source.js";
import { flush, inRoot } from "../support/root.js";
import { n } from "../support/fixtures.js";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const ids = (t: { flatRows: () => { node: { id: string } }[] }) => t.flatRows().map((r) => r.node.id);

function setup(extra: Parameters<typeof createDatabaseTreeController>[0] extends infer O ? Partial<O> : never = {}) {
  const fake = fakeSource([n("a"), n("b"), n("c")], { a: [n("a1"), n("a2")], a1: [n("a1x")] });
  const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client(), ...extra }));
  return { fake, t };
}

describe("createDatabaseTreeController — loading", () => {
  it("shows a roots placeholder until roots resolve", async () => {
    const { t } = setup();
    expect(t.flatRows()[0].node.type).toBe(LOADING_TYPE);
    await flush();
    expect(ids(t)).toEqual(["a", "b", "c"]);
  });

  it("expandable nodes get a Loading… child; leaves do not", async () => {
    const { t } = setup();
    await flush();
    const byId = Object.fromEntries(t.flatRows().map((r) => [r.node.id, r]));
    expect(byId.a.hasChildren).toBe(true);
    expect(byId.b.hasChildren).toBe(false);
  });

  it("expanding lazily loads children once", async () => {
    const { t, fake } = setup();
    await flush();
    t.expand("a");
    expect(t.isLoading("a")).toBe(true);
    await flush();
    expect(t.isLoading("a")).toBe(false);
    expect(ids(t)).toEqual(["a", "a1", "a2", "b", "c"]);
    t.collapse("a");
    t.expand("a");
    await flush();
    expect(fake.calls.children).toEqual(["a"]);
  });

  it("loadChildren does not double-fetch while in flight", async () => {
    const { t, fake } = setup();
    await flush();
    fake.hold("a");
    void t.loadChildren("a");
    void t.loadChildren("a");
    fake.release("a");
    await flush();
    expect(fake.calls.children).toEqual(["a"]);
  });

  it("reloadChildren refetches a loaded branch", async () => {
    const { t, fake } = setup();
    await flush();
    t.expand("a");
    await flush();
    await t.reloadChildren("a");
    expect(fake.calls.children).toEqual(["a", "a"]);
  });

  it("a failed load is not retried automatically, but reloadChildren retries", async () => {
    const { t, fake } = setup();
    await flush();
    fake.fail("a");
    t.expand("a");
    await flush();
    await flush();
    expect(fake.calls.children).toEqual(["a"]);
    // Placeholder rows are synthesized now (SPEC-contracts §3): an error row, not a fake node.
    expect(t.flatRows().find((r) => r.id === "a::placeholder")?.placeholder).toBe("error");
    fake.heal("a");
    await t.reloadChildren("a");
    expect(ids(t)).toContain("a1");
  });

  it("refetchRoots re-runs getRoots", async () => {
    const { t, fake } = setup();
    await flush();
    await t.refetchRoots();
    expect(fake.calls.roots).toBe(2);
  });

  it("restored expansion (persistence) triggers lazy loads on mount", async () => {
    localStorage.setItem("tree-db", JSON.stringify({ a: true }));
    const { t } = setup({ storageKey: "db" });
    await flush();
    await flush();
    expect(ids(t)).toContain("a1");
    localStorage.clear();
  });

  it("calls the consumer's onToggle as well as loading", async () => {
    const onToggle = vi.fn();
    const { t } = setup({ onToggle });
    await flush();
    t.expand("a");
    expect(onToggle).toHaveBeenCalledWith("a", true);
  });
});

describe("realtime", () => {
  it("subscribes on mount and unsubscribes on dispose", async () => {
    const { t, fake } = setup();
    await flush();
    expect(fake.subscribed).toBe(true);
    t.dispose();
    expect(fake.unsubscribed).toBe(1);
  });

  it("applies update, insert (root and loaded parent) and remove", async () => {
    const { t, fake } = setup();
    await flush();
    t.expand("a");
    await flush();
    fake.emit({ type: "update", node: { ...n("b"), label: "Bee" } });
    fake.emit({ type: "insert", parentId: null, node: { ...n("d"), payload: { leaf: true } } });
    fake.emit({ type: "insert", parentId: "a", node: { ...n("a3"), payload: { leaf: true } } });
    fake.emit({ type: "remove", id: "c" });
    await flush();
    expect(ids(t)).toEqual(["a", "a1", "a2", "a3", "b", "d"]);
    expect(t.flatRows().find((r) => r.node.id === "b")!.node.label).toBe("Bee");
  });

  it("ignores inserts under an unloaded parent", async () => {
    const { t, fake } = setup();
    await flush();
    fake.emit({ type: "insert", parentId: "a", node: n("ghost") });
    t.expand("a");
    await flush();
    expect(ids(t)).not.toContain("ghost");
  });

  it("reload drops lazy children and refetches roots", async () => {
    const { t, fake } = setup();
    await flush();
    t.expand("a");
    await flush();
    fake.emit({ type: "reload" });
    await flush();
    await flush();
    expect(fake.calls.roots).toBe(2);
  });
});

// ── Known defects ────────────────────────────────────────────────────────────────

it("regression(B2): two trees sharing a QueryClient keep separate roots", async () => {
  const qc = client();
  const one = fakeSource([n("one")]);
  const two = fakeSource([n("two")]);
  const t1 = inRoot(() => createDatabaseTreeController({ source: one.source, queryClient: qc }));
  await flush();
  const t2 = inRoot(() => createDatabaseTreeController({ source: two.source, queryClient: qc }));
  await flush();
  expect(ids(t1)).toEqual(["one"]);
  expect(ids(t2)).toEqual(["two"]);
});

it("regression(B4): a failed child load exposes an error state", async () => {
  const { t, fake } = setup();
  await flush();
  fake.fail("a");
  t.expand("a");
  await flush();
  expect(t.error("a")).toBeInstanceOf(Error);
});

it("regression(B4): a failed roots load is distinguishable from an empty tree", async () => {
  const fake = fakeSource([n("a")]);
  fake.fail("__roots");
  const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client() }));
  await flush();
  expect(t.error(null)).toBeInstanceOf(Error);
  expect(t.flatRows()[0].placeholder).toBe("error");
});

it("regression(B5): loading placeholders are not selectable", async () => {
  const onSelect = vi.fn();
  const { t } = setup({ onSelect });
  await flush();
  t.expand("a"); // placeholder visible while loading
  t.select("a::__loading");
  expect(onSelect).not.toHaveBeenCalled();
});

it("regression(B6): inserting the first child under a leaf makes it expandable", async () => {
  const { t, fake } = setup();
  await flush();
  fake.emit({ type: "insert", parentId: "b", node: n("b1") });
  await flush();
  expect(t.flatRows().find((r) => r.node.id === "b")!.hasChildren).toBe(true);
});

it("regression(B7): removing the selected node clears the selection", async () => {
  const { t, fake } = setup();
  await flush();
  t.select("c");
  fake.emit({ type: "remove", id: "c" });
  await flush();
  expect(t.selectedId()).toBeNull();
});

it("regression(G5): expandAll on a lazy tree bounds concurrent child loads", async () => {
  const roots = Array.from({ length: 20 }, (_, i) => n(`r${i}`));
  const kids = Object.fromEntries(roots.map((r) => [r.id, [n(`${r.id}.k`)]]));
  const fake = fakeSource(roots, kids);
  for (const r of roots) fake.hold(r.id);
  const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client() }));
  await flush();
  t.expandAll();
  await flush();
  expect(fake.calls.children.length).toBeLessThanOrEqual(6);
});

describe("phase 5 — database tier", () => {
  it("retry() reloads a failed branch; retry(null) refetches roots", async () => {
    const { t, fake } = setup();
    await flush();
    fake.fail("a");
    t.expand("a");
    await flush();
    expect(t.flatRows().find((r) => r.id === "a::placeholder")?.placeholder).toBe("error");
    fake.heal("a");
    await t.retry("a");
    expect(t.error("a")).toBeNull();
    expect(ids(t)).toContain("a1");
    await t.retry(null);
    expect(fake.calls.roots).toBe(2);
  });

  it("loading(id) and the roots loading state", async () => {
    const { t, fake } = setup();
    expect(t.loading(null)).toBe(true);
    await flush();
    expect(t.loading(null)).toBe(false);
    fake.hold("a");
    t.expand("a");
    await flush();
    expect(t.loading("a")).toBe(true);
    expect(t.flatRows().find((r) => r.id === "a::placeholder")?.placeholder).toBe("loading");
    fake.release("a");
    await flush();
    expect(t.loading("a")).toBe(false);
  });

  it("placeholder rows are not data: not in the index, not navigable", async () => {
    const { t, fake } = setup();
    await flush();
    fake.hold("a");
    t.expand("a");
    const ph = t.flatRows().find((r) => r.kind === "placeholder")!;
    expect(ph.navigable).toBe(false);
    expect(t.index().has(ph.id)).toBe(false);
    fake.release("a");
  });

  it("move: explicit move changes and updates whose parent changed", async () => {
    const { t, fake } = setup();
    await flush();
    t.expand("a");
    await flush();
    fake.emit({ type: "move", id: "b", parentId: "a" });
    await flush();
    expect(t.index().parentOf("b")).toBe("a");
    fake.emit({ type: "update", node: { ...n("b"), label: "B!" }, parentId: null });
    await flush();
    expect(t.index().parentOf("b")).toBeNull();
    expect(t.index().get("b")!.label).toBe("B!");
  });

  it("moving under an unloaded parent makes it expandable; it then loads fresh", async () => {
    const fake = fakeSource([n("a"), n("b"), n("c")], { a: [n("a1")] });
    const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client() }));
    await flush();
    fake.emit({ type: "move", id: "c", parentId: "b" }); // b is a leaf, unloaded
    await flush();
    expect(ids(t)).toEqual(["a", "b"]);
    expect(t.flatRows().find((r) => r.id === "b")!.hasChildren).toBe(true);
  });

  it("inserts respect source.compare", async () => {
    const fake = fakeSource([n("a"), n("c")]);
    fake.source.compare = (x, y) => x.id.localeCompare(y.id);
    const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client() }));
    await flush();
    fake.emit({ type: "insert", parentId: null, node: { ...n("b"), payload: { leaf: true } } });
    await flush();
    expect(ids(t)).toEqual(["a", "b", "c"]);
  });

  it("removing a node forgets its loaded subtree (no stale cache on re-insert)", async () => {
    const { t, fake } = setup();
    await flush();
    t.expand("a");
    await flush();
    fake.emit({ type: "remove", id: "a" });
    await flush();
    fake.emit({ type: "insert", parentId: null, node: n("a") });
    await flush();
    t.expand("a");
    await flush();
    expect(fake.calls.children).toEqual(["a", "a"]);
  });

  it("server search: uses source.search and loads ancestors to reveal hits", async () => {
    const fake = fakeSource([n("a"), n("b")], { a: [n("a1")], a1: [n("deep", undefined, { label: "Needle" })] });
    fake.source.search = async (q) => (q === "nee" ? [n("deep", undefined, { label: "Needle" })] : []);
    fake.source.getAncestors = async (id) => (id === "deep" ? ["a", "a1"] : []);
    const [q, setQ] = createSignal("");
    const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client(), searchQuery: q }));
    await flush();
    setQ("nee");
    for (let i = 0; i < 6; i++) await flush();
    expect(ids(t)).toEqual(["a", "a1", "deep"]);
    setQ("");
    await flush();
    expect(ids(t)).toEqual(["a", "b"]);
  });

  it("server search can be turned off (local matching over loaded nodes)", async () => {
    const fake = fakeSource([n("a"), n("b")]);
    const search = vi.fn(async () => []);
    fake.source.search = search;
    const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client(), searchQuery: "b", serverSearch: false }));
    await flush();
    expect(ids(t)).toEqual(["b"]);
    expect(search).not.toHaveBeenCalled();
  });

  it("dispose removes this tree's entries from a shared QueryClient", async () => {
    const qc = client();
    const keep = inRoot(() => createDatabaseTreeController({ source: fakeSource([n("x")]).source, queryClient: qc }));
    const { t } = (() => {
      const fake = fakeSource([n("a")], { a: [n("a1")] });
      return { t: inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: qc })) };
    })();
    await flush();
    t.expand("a");
    await flush();
    const before = qc.getQueryCache().getAll().length;
    t.dispose();
    expect(qc.getQueryCache().getAll().length).toBeLessThan(before);
    expect(ids(keep)).toEqual(["x"]);
  });

  it("leak check: mounting and disposing 25 trees leaves the shared cache empty", async () => {
    const qc = client();
    for (let i = 0; i < 25; i++) {
      const fake = fakeSource([n("a")], { a: [n("a1")] });
      const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: qc }));
      await flush();
      t.expand("a");
      await flush();
      t.dispose();
      expect(fake.unsubscribed).toBe(1);
    }
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
});
