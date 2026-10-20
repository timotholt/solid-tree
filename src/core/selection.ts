// Selection as a pure reducer. Single mode keeps at most one id; multiple mode adds
// toggle (Ctrl/Cmd), range from an anchor (Shift) and select-all. Ranges are taken over
// the caller-supplied visible order, so collapsed rows are never swept in.

export type SelectionMode = "single" | "multiple";

export interface SelectionState {
  readonly selected: ReadonlySet<string>;
  /** Fixed end of a Shift range; the last plainly-selected or toggled id. */
  readonly anchor: string | null;
}

export const emptySelection: SelectionState = { selected: new Set(), anchor: null };

export type SelectionAction =
  | { type: "select"; id: string }
  | { type: "toggle"; id: string }
  | { type: "range"; id: string; order: readonly string[] }
  | { type: "all"; order: readonly string[] }
  | { type: "clear" }
  | { type: "retain"; has: (id: string) => boolean };

export function reduceSelection(state: SelectionState, action: SelectionAction, mode: SelectionMode): SelectionState {
  switch (action.type) {
    case "select":
      return { selected: new Set([action.id]), anchor: action.id };
    case "toggle": {
      if (mode === "single") {
        return state.selected.has(action.id) ? { selected: new Set(), anchor: null } : { selected: new Set([action.id]), anchor: action.id };
      }
      const next = new Set(state.selected);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { selected: next, anchor: action.id };
    }
    case "range": {
      if (mode === "single") return { selected: new Set([action.id]), anchor: action.id };
      const anchor = state.anchor ?? action.id;
      const a = action.order.indexOf(anchor);
      const b = action.order.indexOf(action.id);
      if (a < 0 || b < 0) return { selected: new Set([action.id]), anchor: action.id };
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { selected: new Set(action.order.slice(lo, hi + 1)), anchor };
    }
    case "all":
      return mode === "single" ? state : { selected: new Set(action.order), anchor: state.anchor };
    case "clear":
      return state.selected.size === 0 && state.anchor === null ? state : emptySelection;
    case "retain": {
      // Drop ids that no longer exist (e.g. after a data change); keep identity if nothing changed.
      let changed = false;
      const next = new Set<string>();
      for (const id of state.selected) {
        if (action.has(id)) next.add(id);
        else changed = true;
      }
      const anchor = state.anchor !== null && !action.has(state.anchor) ? null : state.anchor;
      return changed || anchor !== state.anchor ? { selected: next, anchor } : state;
    }
  }
}
