import type { TreeAccessors, TreeIndex } from "./tree-index.js";

export type DropPosition = "before" | "after" | "inside";

/**
 * Structural validity of moving `sources` relative to `target`. Policy (permissions,
 * types) is the caller's `canMove`; this only rules out impossible moves: unknown ids,
 * moving onto/into itself or its own subtree, and dropping inside a separator.
 */
export function canMove<T>(index: TreeIndex<T>, sources: readonly string[], target: string, position: DropPosition): boolean {
  if (!sources.length || !index.has(target)) return false;
  if (position === "inside" && index.kindOf(target) === "separator") return false;
  for (const s of sources) {
    if (!index.has(s)) return false;
    if (s === target) return false;
    if (index.isAncestor(s, target)) return false;
  }
  return true;
}

/** Rebuild a node with new children. Defaults to `{ ...node, children }`. */
export type WithChildren<T> = (node: T, children: T[] | undefined) => T;

/**
 * Immutable move. Sources are removed (keeping their relative document order) and
 * re-inserted before/after/inside `target`. Only nodes on changed paths are copied.
 * Throws if `canMove` would return false.
 */
export function applyMove<T>(
  roots: readonly T[],
  index: TreeIndex<T>,
  accessors: TreeAccessors<T>,
  withChildren: WithChildren<T>,
  sources: readonly string[],
  target: string,
  position: DropPosition
): T[] {
  if (!canMove(index, sources, target, position)) throw new Error("solid-tree: invalid move");
  // Ignore sources nested inside other sources: they move with their ancestor.
  const set = new Set(sources);
  const moving = [...set]
    .filter((s) => !index.ancestorsOf(s).some((a) => set.has(a)))
    .sort((a, b) => index.orderOf(a) - index.orderOf(b));
  const movingSet = new Set(moving);
  const movedNodes = moving.map((id) => index.get(id)!);

  const rebuild = (list: readonly T[]): T[] => {
    const out: T[] = [];
    for (const node of list) {
      const id = accessors.id(node);
      if (movingSet.has(id)) continue;
      const kids = accessors.children(node);
      let copy = node;
      if (kids && kids.length) {
        const nextKids = rebuild(kids);
        if (id === target && position === "inside") nextKids.push(...movedNodes);
        if (nextKids.length !== kids.length || nextKids.some((k, i) => k !== kids[i])) copy = withChildren(node, nextKids);
      } else if (id === target && position === "inside") {
        copy = withChildren(node, [...movedNodes]);
      }
      if (id === target && position === "before") out.push(...movedNodes);
      out.push(copy);
      if (id === target && position === "after") out.push(...movedNodes);
    }
    return out;
  };
  return rebuild(roots);
}
