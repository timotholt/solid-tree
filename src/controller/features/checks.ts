import { createMemo, createSignal, untrack, type Accessor } from "solid-js";
import { checkStateOf, toggleCheck, type CheckState, type TreeIndex } from "../../core/index.js";
import { access, isProvided } from "../../state/access.js";
import type { TreeNodeData } from "../../types.js";
import type { CoreControllerOptions, LazyHooks } from "../options.js";

/** Checkboxes (SPEC-features 7.3): explicit checked set, cascade/strict, controlled or not. */
export function createChecks<T extends TreeNodeData>(index: Accessor<TreeIndex<T>>, opts: CoreControllerOptions<T> & LazyHooks) {
  const [own, setOwn] = createSignal<ReadonlySet<string>>(new Set());
  const controlled = isProvided(opts, "checkedIds");
  const checkedIds = createMemo<ReadonlySet<string>>(() => (controlled ? new Set(access(opts.checkedIds) ?? []) : own()));

  const isCheckable = (id: string) => {
    const node = index().get(id);
    if (!node || node.disabled || !opts.checkable) return false;
    return typeof opts.checkable === "function" ? opts.checkable(node) : true;
  };
  const isLoaded = (id: string) => opts.isLoaded?.(id) ?? true;
  // Disabled or non-checkable nodes take no part in cascade (never toggled, never counted).
  const isExcluded = (id: string) => !untrack(() => isCheckable(id));
  const mode = () => opts.checkMode ?? "cascade";

  return {
    isCheckable,
    checkState: (id: string): CheckState => checkStateOf(index(), checkedIds(), id, mode(), isLoaded, isExcluded),
    toggleChecked: (id: string) => {
      if (!untrack(() => isCheckable(id))) return;
      const next = toggleCheck(untrack(index), untrack(checkedIds), id, mode(), isLoaded, isExcluded);
      if (!controlled) setOwn(next);
      opts.onCheckedChange?.([...next]);
    },
    checkedIds,
  };
}
