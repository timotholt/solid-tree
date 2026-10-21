import type { TreeChange, TreeNodeData, TreeSource } from "../types.js";

/** The test functions of your runner (Vitest, Jest, …). Only these are used. */
export interface ContractTestApi {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => unknown | Promise<unknown>, timeout?: number): void;
  expect(actual: unknown): {
    toEqual(expected: unknown): void;
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toBeTruthy(): void;
  };
}

export interface ContractFixture {
  /** A source serving exactly `tree` (the contract tree passed to your factory). */
  source: TreeSource;
  /** Optional: mutate the backend so the contract can check realtime events. */
  mutate?: {
    insert(parentId: string | null, node: TreeNodeData): void | Promise<void>;
    update(node: TreeNodeData): void | Promise<void>;
    remove(id: string): void | Promise<void>;
  };
  /** How long to wait for a realtime event after a mutation (ms). Default 2000. */
  eventTimeoutMs?: number;
  cleanup?(): void | Promise<void>;
}

/**
 * The data every adapter is tested against. Seed your backend with it (or have your
 * factory build a source over it), then call {@link runTreeSourceContract}.
 */
export const CONTRACT_TREE: TreeNodeData[] = [
  {
    id: "c-fruit",
    label: "Fruit",
    type: "group",
    children: [
      { id: "c-apple", label: "Apple", type: "item", children: [{ id: "c-seed", label: "Seed", type: "item" }] },
      { id: "c-banana", label: "Banana", type: "item" },
    ],
  },
  { id: "c-veg", label: "Vegetables", type: "group", children: [{ id: "c-carrot", label: "Carrot", type: "item" }] },
  { id: "c-misc", label: "Misc", type: "item" },
];

/**
 * A reusable conformance suite for `TreeSource` adapters (PLAN P5). Register it inside
 * your test file:
 *
 * ```ts
 * import { describe, it, expect } from "vitest";
 * import { runTreeSourceContract } from "@timotholt/solid-tree/testing";
 * runTreeSourceContract("my REST source", (tree) => ({ source: myRestSource(seed(tree)) }), { describe, it, expect });
 * ```
 */
export function runTreeSourceContract(
  name: string,
  makeFixture: (tree: TreeNodeData[]) => ContractFixture | Promise<ContractFixture>,
  { describe, it, expect }: ContractTestApi
): void {
  const ids = (ns: TreeNodeData[]) => ns.map((n) => n.id);
  const withFixture = (fn: (f: ContractFixture) => Promise<void>) => async () => {
    const f = await makeFixture(structuredClone(CONTRACT_TREE));
    try {
      await fn(f);
    } finally {
      await f.cleanup?.();
    }
  };
  const walk = async (source: TreeSource, nodes: TreeNodeData[]): Promise<TreeNodeData[]> => {
    const out: TreeNodeData[] = [];
    for (const node of nodes) {
      const isLeaf = node.payload?.leaf === true;
      const kids = source.getChildren && !isLeaf ? await walk(source, await source.getChildren(node)) : [];
      out.push({ id: node.id, label: node.label, type: node.type, ...(kids.length ? { children: kids } : {}) });
    }
    return out;
  };
  const shape = (ns: TreeNodeData[]): unknown => ns.map((n) => ({ id: n.id, label: n.label, ...(n.children ? { children: shape(n.children) } : {}) }));
  const nextEvent = (source: TreeSource, timeoutMs: number) =>
    new Promise<TreeChange>((resolve, reject) => {
      const timer = setTimeout(() => (unsub(), reject(new Error("no realtime event"))), timeoutMs);
      const unsub = source.subscribe!((c) => {
        clearTimeout(timer);
        unsub();
        resolve(c);
      });
    });

  describe(`TreeSource contract: ${name}`, () => {
    it("getRoots returns the roots, in order", withFixture(async ({ source }) => {
      expect(ids(await source.getRoots())).toEqual(ids(CONTRACT_TREE));
    }));

    it("walking getChildren reproduces the whole tree (ids, labels, order)", withFixture(async ({ source }) => {
      expect(shape(await walk(source, await source.getRoots()))).toEqual(shape(CONTRACT_TREE));
    }));

    it("leaves are flagged payload.leaf = true (so no chevron is shown)", withFixture(async ({ source }) => {
      if (!source.getChildren) return;
      const roots = await source.getRoots();
      expect(roots.find((n) => n.id === "c-misc")?.payload?.leaf).toBe(true);
      expect(roots.find((n) => n.id === "c-fruit")?.payload?.leaf === true).toBe(false);
    }));

    it("ids are unique across the tree", withFixture(async ({ source }) => {
      const all: string[] = [];
      const collect = (ns: TreeNodeData[]) => ns.forEach((n) => (all.push(n.id), n.children && collect(n.children)));
      collect(await walk(source, await source.getRoots()));
      expect(new Set(all).size).toBe(all.length);
    }));

    it("subscribe returns an unsubscribe function that is safe to call twice", withFixture(async ({ source }) => {
      if (!source.subscribe) return;
      const unsub = source.subscribe(() => {});
      expect(typeof unsub).toBe("function");
      unsub();
      unsub();
    }));

    it("mutations emit insert / update / remove changes", withFixture(async ({ source, mutate, eventTimeoutMs }) => {
      if (!source.subscribe || !mutate) return;
      const t = eventTimeoutMs ?? 2000;
      let ev = nextEvent(source, t);
      await mutate.insert("c-veg", { id: "c-pea", label: "Pea", type: "item" });
      let c = await ev;
      expect(c.type).toBe("insert");
      if (c.type === "insert") {
        expect(c.node.id).toBe("c-pea");
        expect(c.parentId).toBe("c-veg");
      }
      ev = nextEvent(source, t);
      await mutate.update({ id: "c-pea", label: "Green pea", type: "item" });
      c = await ev;
      expect(c.type).toBe("update");
      if (c.type === "update") expect(c.node.label).toBe("Green pea");
      ev = nextEvent(source, t);
      await mutate.remove("c-pea");
      c = await ev;
      expect(c.type === "remove" ? c.id : c.type).toBe("c-pea");
    }));

    it("search (if provided) returns only real nodes and finds an exact label", withFixture(async ({ source }) => {
      if (!source.search) return;
      const hits = await source.search("Carrot");
      expect(ids(hits)).toContain("c-carrot");
      const known = new Set<string>();
      const collect = (ns: TreeNodeData[]) => ns.forEach((n) => (known.add(n.id), n.children && collect(n.children)));
      collect(CONTRACT_TREE);
      for (const h of hits) expect(known.has(h.id)).toBe(true);
    }));

    it("getAncestors (if provided) returns the chain, root first", withFixture(async ({ source }) => {
      if (!source.getAncestors) return;
      expect(await source.getAncestors("c-seed")).toEqual(["c-fruit", "c-apple"]);
      expect(await source.getAncestors("c-fruit")).toEqual([]);
    }));
  });
}
