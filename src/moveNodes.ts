import { applyMove, buildIndex, defaultAccessors, type DropPosition } from "./core/index.js";
import type { TreeNodeData } from "./types.js";

/**
 * For in-memory apps: the new data after moving `sources` before/after/inside `target`.
 * Call it from `onMove` and store the result (immutable; untouched subtrees are shared).
 *
 * ```tsx
 * <Tree data={data()} onMove={(s, t, p) => setData(moveNodes(data(), s, t, p))} />
 * ```
 */
export function moveNodes<T extends TreeNodeData>(data: readonly T[], sources: string[], target: string, position: DropPosition): T[] {
  const index = buildIndex(data as T[]);
  return applyMove(data as T[], index, defaultAccessors<T>(), (node, children) => ({ ...node, children }) as T, sources, target, position);
}
