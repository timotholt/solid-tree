// Normalized, read-only index over a nested tree (ANALYSIS D1). Built once per data
// change; every structural lookup is O(1) afterwards. Pure: no Solid, no DOM.
// Traversal is iterative, so very deep trees cannot overflow the call stack.

export type RowKind = "node" | "separator";

/** How to read a consumer's node shape. Defaults fit `TreeNodeData`. */
export interface TreeAccessors<T> {
  id(node: T): string;
  children(node: T): readonly T[] | undefined;
  kind?(node: T): RowKind;
}

export interface TreeIndex<T> {
  /** Root ids, in order. */
  readonly roots: readonly string[];
  /** Every id in document (pre-)order. */
  readonly order: readonly string[];
  readonly size: number;
  has(id: string): boolean;
  get(id: string): T | undefined;
  /** Parent id; `null` for roots; `undefined` for unknown ids. */
  parentOf(id: string): string | null | undefined;
  /** Child ids in order (empty for leaves and unknown ids). */
  childrenOf(id: string): readonly string[];
  /** Sibling ids including `id` itself (roots for a root). */
  siblingsOf(id: string): readonly string[];
  /** 0-based depth; -1 for unknown ids. */
  depthOf(id: string): number;
  /** Position in document order; -1 for unknown ids. */
  orderOf(id: string): number;
  kindOf(id: string): RowKind | undefined;
  /** Ancestor ids, nearest first. */
  ancestorsOf(id: string): string[];
  /** True when `ancestor` is a strict ancestor of `id`. */
  isAncestor(ancestor: string, id: string): boolean;
  /** Ids of the subtree rooted at `id` (excluding `id`), in document order. */
  descendantsOf(id: string): string[];
}

export class DuplicateIdError extends Error {
  constructor(readonly id: string) {
    super(`solid-tree: duplicate node id "${id}" — ids must be unique across the whole tree`);
    this.name = "DuplicateIdError";
  }
}

interface Entry<T> {
  node: T;
  parent: string | null;
  depth: number;
  order: number;
  kind: RowKind;
  children: string[];
  /** order index one past the last descendant (subtree = [order+1, end)). */
  end: number;
}

const EMPTY: readonly string[] = Object.freeze([]);

/** Structural node shape the default accessors read (`TreeNodeData` satisfies it). */
export interface DefaultNodeShape {
  id: string;
  children?: readonly DefaultNodeShape[];
  isDivider?: boolean;
  kind?: string;
}

/** Accessors for `DefaultNodeShape`-like nodes: `id`, `children`, and `isDivider`/`kind: "separator"`. */
export function defaultAccessors<T extends DefaultNodeShape>(): TreeAccessors<T> {
  return {
    id: (n) => n.id,
    children: (n) => n.children as readonly T[] | undefined,
    kind: (n) => (n.kind === "separator" || n.isDivider ? "separator" : "node"),
  };
}

export function buildIndex<T extends DefaultNodeShape>(nodes: readonly T[]): TreeIndex<T>;
export function buildIndex<T>(nodes: readonly T[], accessors: TreeAccessors<T>): TreeIndex<T>;
export function buildIndex<T>(nodes: readonly T[], accessors: TreeAccessors<T> = defaultAccessors() as unknown as TreeAccessors<T>): TreeIndex<T> {
  const entries = new Map<string, Entry<T>>();
  const order: string[] = [];
  const roots: string[] = [];
  const kindOf = accessors.kind ?? (() => "node" as const);

  // Iterative pre-order walk. Stack holds [node, parentId, depth] in reverse sibling order.
  const stack: [T, string | null, number][] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push([nodes[i], null, 0]);
  // Closing markers let us record each subtree's end without recursion.
  const open: string[] = [];

  while (stack.length) {
    const [node, parent, depth] = stack.pop()!;
    // Close any subtrees we have walked out of.
    while (open.length && entries.get(open[open.length - 1])!.depth >= depth) {
      entries.get(open.pop()!)!.end = order.length;
    }
    const id = accessors.id(node);
    if (entries.has(id)) throw new DuplicateIdError(id);
    const entry: Entry<T> = { node, parent, depth, order: order.length, kind: kindOf(node), children: [], end: 0 };
    entries.set(id, entry);
    order.push(id);
    if (parent === null) roots.push(id);
    else entries.get(parent)!.children.push(id);
    open.push(id);
    const kids = accessors.children(node);
    if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], id, depth + 1]);
  }
  while (open.length) entries.get(open.pop()!)!.end = order.length;

  const index: TreeIndex<T> = {
    roots,
    order,
    size: order.length,
    has: (id) => entries.has(id),
    get: (id) => entries.get(id)?.node,
    parentOf: (id) => entries.get(id)?.parent,
    childrenOf: (id) => entries.get(id)?.children ?? EMPTY,
    siblingsOf: (id) => {
      const e = entries.get(id);
      if (!e) return EMPTY;
      return e.parent === null ? roots : entries.get(e.parent)!.children;
    },
    depthOf: (id) => entries.get(id)?.depth ?? -1,
    orderOf: (id) => entries.get(id)?.order ?? -1,
    kindOf: (id) => entries.get(id)?.kind,
    ancestorsOf: (id) => {
      const out: string[] = [];
      let p = entries.get(id)?.parent ?? null;
      while (p !== null) {
        out.push(p);
        p = entries.get(p)!.parent;
      }
      return out;
    },
    isAncestor: (ancestor, id) => {
      const a = entries.get(ancestor);
      const e = entries.get(id);
      return !!a && !!e && e.order > a.order && e.order < a.end;
    },
    descendantsOf: (id) => {
      const e = entries.get(id);
      return e ? order.slice(e.order + 1, e.end) : [];
    },
  };
  return index;
}
