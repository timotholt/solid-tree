import { untrack, type Accessor, type Setter } from "solid-js";
import { applyMove, canMove as structurallyMovable, defaultAccessors, type DropPosition, type TreeIndex } from "../../core/index.js";
import type { TreeNodeData } from "../../types.js";
import type { CoreControllerOptions } from "../options.js";

/**
 * Moves (SPEC-features 7.4): structural + policy checks, and the optimistic overlay that
 * shows a move immediately until `onMove` settles. The pointer UI lives in the view
 * (view/headless/dnd.ts, loaded on demand).
 */
export function createMoves<T extends TreeNodeData>(deps: {
  index: Accessor<TreeIndex<T>>;
  data: Accessor<readonly T[]>;
  setOverlay: Setter<readonly T[] | null>;
  openNode: (id: string) => void;
  opts: CoreControllerOptions<T>;
}) {
  const { index, data, setOverlay, openNode, opts } = deps;

  const canMoveTo = (sources: string[], target: string, position: DropPosition) => {
    if (!opts.onMove) return false;
    const idx = untrack(index);
    if (!structurallyMovable(idx, sources, target, position)) return false;
    if (sources.some((s) => idx.get(s)?.disabled)) return false;
    return !opts.canMove || opts.canMove(sources, target, position);
  };

  const move = async (sources: string[], target: string, position: DropPosition) => {
    if (!canMoveTo(sources, target, position)) return false;
    if (opts.optimisticMoves !== false) {
      const idx = untrack(index);
      setOverlay(applyMove(untrack(data) as T[], idx, defaultAccessors<T>(), (node, children) => ({ ...node, children }) as T, sources, target, position));
      if (position === "inside") openNode(target);
    }
    try {
      const ok = await opts.onMove!(sources, target, position);
      return ok !== false;
    } catch {
      return false;
    } finally {
      setOverlay(null);
    }
  };

  return { movesEnabled: () => !!opts.onMove, canMoveTo, move };
}
