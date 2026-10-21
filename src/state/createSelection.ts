import { createMemo, createSignal, untrack, type Accessor } from "solid-js";
import { emptySelection, reduceSelection, type SelectionAction, type SelectionMode, type SelectionState, type TreeIndex } from "../core/index.js";

export interface SelectionOptions<T> {
  index: Accessor<TreeIndex<T>>;
  mode: Accessor<SelectionMode>;
  /** Controlled single selection (provided ⇒ controlled; `null` = nothing selected). */
  controlledId?: Accessor<string | null | undefined>;
  /** Controlled multiple selection. */
  controlledIds?: Accessor<Iterable<string> | null | undefined>;
  canSelect?: (node: T) => boolean;
  /** Fires when the user selects a node (the primary id of a select/toggle/range). */
  onSelect?: (node: T) => void;
  /** Fires on every change, including deselect and data-driven removal (ANALYSIS B10, B7). */
  onSelectionChange?: (ids: string[]) => void;
}

export interface Selection {
  ids: Accessor<ReadonlySet<string>>;
  /** Primary selection: the anchor, else the first selected id. */
  id: Accessor<string | null>;
  apply(action: SelectionAction, primary?: string): void;
}

export function createSelection<T>(opts: SelectionOptions<T>): Selection {
  const [own, setOwn] = createSignal<SelectionState>(emptySelection);
  const controlled = !!opts.controlledId || !!opts.controlledIds;

  const state = createMemo<SelectionState>(() => {
    if (opts.controlledIds) {
      const ids = new Set(opts.controlledIds() ?? []);
      return { selected: ids, anchor: untrack(own).anchor };
    }
    if (opts.controlledId) {
      const id = opts.controlledId() ?? null;
      return { selected: new Set(id === null ? [] : [id]), anchor: id };
    }
    return own();
  });

  const allowed = (id: string) => {
    const node = untrack(opts.index).get(id);
    if (node === undefined) return false;
    if ((node as { disabled?: boolean }).disabled) return false;
    return !opts.canSelect || opts.canSelect(node);
  };

  return {
    ids: () => state().selected,
    id: () => {
      const s = state();
      if (s.anchor !== null && s.selected.has(s.anchor)) return s.anchor;
      const first = s.selected.values().next();
      return first.done ? null : first.value;
    },
    apply(action, primary) {
      if ("id" in action && !allowed(action.id)) return;
      const cur = untrack(state);
      let next = reduceSelection(cur, action, untrack(opts.mode));
      if (action.type === "range" || action.type === "all") {
        // Never sweep vetoed or disabled nodes into a range.
        const filtered = new Set([...next.selected].filter(allowed));
        if (filtered.size !== next.selected.size) next = { selected: filtered, anchor: next.anchor };
      }
      const changed = next.selected.size !== cur.selected.size || [...next.selected].some((id) => !cur.selected.has(id));
      if (!controlled) setOwn(next);
      else if (next.anchor !== cur.anchor) setOwn({ selected: own().selected, anchor: next.anchor });
      const p = primary ?? ("id" in action ? action.id : undefined);
      if (p !== undefined && next.selected.has(p) && action.type !== "retain") {
        const node = untrack(opts.index).get(p);
        if (node !== undefined) opts.onSelect?.(node);
      }
      if (changed) opts.onSelectionChange?.([...next.selected]);
    },
  };
}
