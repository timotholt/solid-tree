import type { TreeIndex } from "./tree-index.js";

// Checkbox model over an explicit set of checked ids.
//
// - "strict": every node is independent.
// - "cascade": checking a node checks its loaded descendants; a parent whose LOADED
//   children are all checked becomes checked, and unchecking anything unchecks its
//   ancestors. A node whose children are not loaded keeps its explicit value — it is
//   never "mixed" because of children nobody has seen. That keeps "everything under X"
//   expressible for server-side bulk operations (PLAN P7.3).

export type CheckMode = "strict" | "cascade";
export type CheckState = "checked" | "unchecked" | "mixed";

/** `isLoaded(id)`: whether `id`'s children are known. Defaults to true (in-memory trees). */
export type IsLoaded = (id: string) => boolean;
const always: IsLoaded = () => true;
/** Nodes that take no part in checking (e.g. disabled): never toggled, never counted. */
export type IsExcluded = (id: string) => boolean;
const never: IsExcluded = () => false;

export function checkStateOf<T>(
  index: TreeIndex<T>,
  checked: ReadonlySet<string>,
  id: string,
  mode: CheckMode,
  isLoaded: IsLoaded = always,
  isExcluded: IsExcluded = never
): CheckState {
  if (mode === "strict") return checked.has(id) ? "checked" : "unchecked";
  const kids = index.childrenOf(id).filter((c) => index.kindOf(c) !== "separator" && !isExcluded(c));
  if (!kids.length || !isLoaded(id)) return checked.has(id) ? "checked" : "unchecked";
  let all = true;
  let any = false;
  for (const k of kids) {
    const s = checkStateOf(index, checked, k, mode, isLoaded, isExcluded);
    if (s !== "checked") all = false;
    if (s !== "unchecked") any = true;
    if (!all && any) return "mixed";
  }
  return all ? "checked" : any ? "mixed" : "unchecked";
}

/** Toggle `id`: unchecked or mixed → checked, checked → unchecked. Returns a new set. */
export function toggleCheck<T>(
  index: TreeIndex<T>,
  checked: ReadonlySet<string>,
  id: string,
  mode: CheckMode,
  isLoaded: IsLoaded = always,
  isExcluded: IsExcluded = never
): Set<string> {
  const next = new Set(checked);
  if (isExcluded(id)) return next;
  // A partly checked (mixed) node becomes fully checked, like an installer's tri-state box.
  const turnOn = checkStateOf(index, checked, id, mode, isLoaded, isExcluded) !== "checked";
  if (mode === "strict") {
    if (turnOn) next.add(id);
    else next.delete(id);
    return next;
  }
  // Excluded (disabled) nodes and everything under them keep their state.
  const subtree = [id, ...index.descendantsOf(id)].filter(
    (x) => index.kindOf(x) !== "separator" && !isExcluded(x) && !index.ancestorsOf(x).some((a) => a !== id && index.isAncestor(id, a) && isExcluded(a))
  );
  for (const x of subtree) {
    if (turnOn) next.add(x);
    else next.delete(x);
  }
  // Re-derive ancestors bottom-up so the explicit set stays consistent with the rule.
  for (const a of index.ancestorsOf(id)) {
    if (!isLoaded(a)) break;
    if (isExcluded(a)) break;
    const kids = index.childrenOf(a).filter((c) => index.kindOf(c) !== "separator" && !isExcluded(c));
    if (kids.every((k) => next.has(k))) next.add(a);
    else next.delete(a);
  }
  return next;
}
