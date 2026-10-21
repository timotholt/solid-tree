import { createSignal, untrack, type Accessor } from "solid-js";
import type { TreeIndex } from "../../core/index.js";
import type { TreeNodeData } from "../../types.js";
import type { CoreControllerOptions } from "../options.js";

/** Inline rename (SPEC-features 7.2): editing state, optimistic label, rollback. */
export function createRename<T extends TreeNodeData>(index: Accessor<TreeIndex<T>>, opts: CoreControllerOptions<T>) {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal<ReadonlyMap<string, string>>(new Map());

  const canRenameNode = (id: string) => {
    const node = untrack(index).get(id);
    if (!node || node.disabled || !opts.onRename) return false;
    return !opts.canRename || opts.canRename(node);
  };

  const commitEditing = async (value: string) => {
    const id = untrack(editingId);
    if (id === null) return;
    setEditingId(null);
    const node = untrack(index).get(id);
    const next = value.trim();
    if (!node || !next || next === node.label || !opts.onRename) return;
    setPending((m) => new Map(m).set(id, next));
    try {
      const ok = await opts.onRename(node, next);
      if (ok === false) opts.onRenameError?.(node, new Error("rename rejected"));
      else if (typeof ok === "string") opts.onRenameError?.(node, new Error(ok));
    } catch (e) {
      opts.onRenameError?.(node, e);
    } finally {
      // The data wins once the result is in (the app updated it, or did not).
      setPending((m) => {
        const copy = new Map(m);
        copy.delete(id);
        return copy;
      });
    }
  };

  return {
    editingId,
    canRenameNode,
    startEditing: (id: string) => {
      if (canRenameNode(id)) setEditingId(id);
    },
    cancelEditing: () => setEditingId(null),
    commitEditing,
    pendingLabel: (id: string) => pending().get(id),
    renameOnBlur: (): "commit" | "cancel" => opts.renameOnBlur ?? "commit",
  };
}
