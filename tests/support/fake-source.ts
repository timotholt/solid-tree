import type { TreeChange, TreeNodeData, TreeSource } from "../../src/types.js";

/**
 * Scriptable TreeSource for tests. `children` maps parent id → child list; nodes without
 * an entry are leaves (payload.leaf = true is set automatically). Calls are recorded, and
 * failures / manual resolution can be scripted per parent id.
 */
export function fakeSource(roots: TreeNodeData[], children: Record<string, TreeNodeData[]> = {}) {
  const leafify = (node: TreeNodeData): TreeNodeData =>
    children[node.id] ? node : { ...node, payload: { ...(node.payload ?? {}), leaf: true } };
  const calls = { roots: 0, children: [] as string[] };
  const failing = new Set<string>();
  const gates = new Map<string, () => void>();
  let listener: ((c: TreeChange) => void) | undefined;
  let unsubscribed = 0;

  const source: TreeSource = {
    async getRoots() {
      calls.roots++;
      if (failing.has("__roots")) throw new Error("roots failed");
      return roots.map(leafify);
    },
    async getChildren(node) {
      calls.children.push(node.id);
      const gate = gates.get(node.id);
      if (gate) await new Promise<void>((resolve) => gates.set(node.id, resolve));
      if (failing.has(node.id)) throw new Error(`children of ${node.id} failed`);
      return (children[node.id] ?? []).map(leafify);
    },
    subscribe(onChange) {
      listener = onChange;
      return () => {
        listener = undefined;
        unsubscribed++;
      };
    },
  };

  return {
    source,
    calls,
    fail: (id: string) => failing.add(id),
    heal: (id: string) => failing.delete(id),
    /** Make getChildren(id) wait until release(id) is called. */
    hold: (id: string) => gates.set(id, () => {}),
    release: (id: string) => {
      const g = gates.get(id);
      gates.delete(id);
      g?.();
    },
    emit: (c: TreeChange) => listener?.(c),
    get subscribed() {
      return !!listener;
    },
    get unsubscribed() {
      return unsubscribed;
    },
  };
}
