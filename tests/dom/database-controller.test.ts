import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/solid-query";
import { createDatabaseTreeController, LOADING_TYPE } from "../../src/database/createDatabaseTreeController.js";
import { knownDefect } from "../support/known-defect.js";
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
    expect(ids(t)).toContain("a::__loading");
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

knownDefect("B2", "two trees sharing a QueryClient keep separate roots", async () => {
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

knownDefect("B4", "a failed child load exposes an error state", async () => {
  const { t, fake } = setup();
  await flush();
  fake.fail("a");
  t.expand("a");
  await flush();
  expect((t as unknown as { error?: (id: string) => unknown }).error?.("a")).toBeTruthy();
});

knownDefect("B4", "a failed roots load is distinguishable from an empty tree", async () => {
  const fake = fakeSource([n("a")]);
  fake.fail("__roots");
  const t = inRoot(() => createDatabaseTreeController({ source: fake.source, queryClient: client() }));
  await flush();
  expect((t as unknown as { error?: (id: string | null) => unknown }).error?.(null)).toBeTruthy();
});

knownDefect("B5", "loading placeholders are not selectable", async () => {
  const onSelect = vi.fn();
  const { t } = setup({ onSelect });
  await flush();
  t.expand("a"); // placeholder visible while loading
  t.select("a::__loading");
  expect(onSelect).not.toHaveBeenCalled();
});

knownDefect("B6", "inserting the first child under a leaf makes it expandable", async () => {
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

knownDefect("G5", "expandAll on a lazy tree bounds concurrent child loads", async () => {
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
