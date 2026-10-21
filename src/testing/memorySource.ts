import type { TreeChange, TreeNodeData, TreeSource } from "../types.js";

export interface MemorySourceOptions {
  /** Response delay in ms: a number, or [min, max] for a random delay. Default 0. */
  latency?: number | [number, number];
  /** Probability (0..1) that a getRoots/getChildren call rejects. Default 0. */
  failRate?: number;
  /** Seed for latency/failure randomness, so runs are reproducible. Default 1. */
  seed?: number;
  /** Provide `search` + `getAncestors` (case-insensitive label substring). Default true. */
  search?: boolean;
}

export interface MemorySource extends TreeSource {
  /** Mutate the backing tree AND emit the matching realtime change. */
  insert(parentId: string | null, node: TreeNodeData, index?: number): void;
  update(node: Partial<TreeNodeData> & { id: string }): void;
  remove(id: string): void;
  move(id: string, parentId: string | null, index?: number): void;
  /** Emit a raw change without touching the backing tree. */
  emit(change: TreeChange): void;
  /** Make loads of this id (or "__roots") fail until heal(). */
  fail(id: string): void;
  heal(id: string): void;
  readonly calls: { roots: number; children: string[]; search: string[] };
  /** A deep copy of the current backing tree. */
  snapshot(): TreeNodeData[];
}

/**
 * An in-memory `TreeSource` with realistic async behavior: latency, failures,
 * realtime events, server search. For tests, demos, and prototyping before a backend
 * exists. Nodes are served without `children`; leaves get `payload.leaf = true`.
 */
export function createMemorySource(tree: TreeNodeData[], opts: MemorySourceOptions = {}): MemorySource {
  const roots: TreeNodeData[] = structuredCloneTree(tree);
  const listeners = new Set<(c: TreeChange) => void>();
  const failing = new Set<string>();
  const calls = { roots: 0, children: [] as string[], search: [] as string[] };
  let seed = opts.seed ?? 1;
  const random = () => {
    // mulberry32
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const delay = () => {
    const l = opts.latency ?? 0;
    const ms = Array.isArray(l) ? l[0] + random() * (l[1] - l[0]) : l;
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  };
  const maybeFail = (id: string) => {
    if (failing.has(id) || (opts.failRate ?? 0) > random()) throw new Error(`memory source: load of ${id} failed`);
  };

  const find = (id: string, list = roots, parent: TreeNodeData | null = null): { node: TreeNodeData; parent: TreeNodeData | null; list: TreeNodeData[] } | null => {
    for (const node of list) {
      if (node.id === id) return { node, parent, list };
      const hit = node.children ? find(id, node.children, node) : null;
      if (hit) return hit;
    }
    return null;
  };
  const listOf = (parentId: string | null) => {
    if (parentId === null) return roots;
    const p = find(parentId);
    if (!p) throw new Error(`memory source: unknown parent ${parentId}`);
    return (p.node.children ??= []);
  };
  const serve = (n: TreeNodeData): TreeNodeData => {
    const { children, ...rest } = n;
    return children && children.length ? { ...rest } : { ...rest, payload: { ...(rest.payload ?? {}), leaf: true } };
  };
  const emit = (c: TreeChange) => listeners.forEach((l) => l(c));

  const source: MemorySource = {
    async getRoots() {
      calls.roots++;
      await delay();
      maybeFail("__roots");
      return roots.map(serve);
    },
    async getChildren(node) {
      calls.children.push(node.id);
      await delay();
      maybeFail(node.id);
      return (find(node.id)?.node.children ?? []).map(serve);
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    insert(parentId, node, index) {
      const list = listOf(parentId);
      const copy = structuredCloneTree([node])[0];
      list.splice(index ?? list.length, 0, copy);
      emit({ type: "insert", parentId, node: serve(copy) });
    },
    update(patch) {
      const hit = find(patch.id);
      if (!hit) return;
      Object.assign(hit.node, patch);
      emit({ type: "update", node: serve(hit.node), parentId: hit.parent?.id ?? null });
    },
    remove(id) {
      const hit = find(id);
      if (!hit) return;
      hit.list.splice(hit.list.indexOf(hit.node), 1);
      emit({ type: "remove", id });
    },
    move(id, parentId, index) {
      const hit = find(id);
      if (!hit) return;
      hit.list.splice(hit.list.indexOf(hit.node), 1);
      const list = listOf(parentId);
      list.splice(index ?? list.length, 0, hit.node);
      emit({ type: "move", id, parentId, index });
    },
    emit,
    fail: (id) => void failing.add(id),
    heal: (id) => void failing.delete(id),
    calls,
    snapshot: () => structuredCloneTree(roots),
  };

  if (opts.search !== false) {
    source.search = async (query) => {
      calls.search.push(query);
      await delay();
      const q = query.toLowerCase();
      const out: TreeNodeData[] = [];
      const walk = (list: TreeNodeData[]) =>
        list.forEach((n) => {
          if (n.label.toLowerCase().includes(q)) out.push(serve(n));
          if (n.children) walk(n.children);
        });
      walk(roots);
      return out;
    };
    source.getAncestors = async (id) => {
      await delay();
      const chain: string[] = [];
      let hit = find(id);
      while (hit?.parent) {
        chain.unshift(hit.parent.id);
        hit = find(hit.parent.id);
      }
      return chain;
    };
  }
  return source;
}

function structuredCloneTree(tree: TreeNodeData[]): TreeNodeData[] {
  return tree.map((n) => ({ ...n, ...(n.children ? { children: structuredCloneTree(n.children) } : {}) }));
}
