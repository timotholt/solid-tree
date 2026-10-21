import { createEffect, createMemo, createSignal, onMount, untrack, type Accessor } from "solid-js";
import type { TreeIndex } from "../core/index.js";
import type { PersistenceAdapter } from "./persistence.js";

export interface ExpansionOptions {
  index: Accessor<TreeIndex<unknown>>;
  /** Controlled ids. When provided (`controlled` is defined), the internal state is not used. */
  controlled?: Accessor<Iterable<string> | undefined | null>;
  onExpandedChange?: (ids: string[]) => void;
  onToggle?: (id: string, expanded: boolean) => void;
  persistence?: PersistenceAdapter | null;
  /**
   * Drop restored ids that are not in the index at mount (ANALYSIS B9). Lazy trees set
   * this false: their restored ids become active (and fire onToggle) when they load.
   */
  pruneUnknown?: boolean;
  /**
   * Extra ids open from the start (e.g. ancestors of the initial selection). Part of the
   * initial state, so the very first render — including SSR — includes them (G8).
   * onToggle fires for them on mount, like restored ids.
   */
  initial?: readonly string[];
}

/** The user's expansion state (persisted). Search's ephemeral layer lives elsewhere. */
export interface Expansion {
  ids: Accessor<ReadonlySet<string>>;
  isOpen(id: string): boolean;
  /** Set one id. Fires onToggle/onExpandedChange only on an actual change. */
  set(id: string, open: boolean): void;
  /** Open many ids at once (one state update). */
  openMany(ids: Iterable<string>): void;
  closeAll(): void;
}

export function createExpansion(opts: ExpansionOptions): Expansion {
  const loaded = untrack(() => (opts.controlled ? null : opts.persistence?.load() ?? null));
  const restored = opts.controlled ? null : [...new Set([...(loaded ?? []), ...(opts.initial ?? [])])];
  const [own, setOwn] = createSignal<ReadonlySet<string>>(new Set(restored ?? []));
  const ids = createMemo<ReadonlySet<string>>(() => {
    if (opts.controlled) return new Set(opts.controlled() ?? []);
    return own();
  });

  const commit = (next: ReadonlySet<string>, changes: [string, boolean][]) => {
    if (!changes.length) return;
    if (!opts.controlled) setOwn(next);
    opts.onExpandedChange?.([...next]);
    for (const [id, open] of changes) opts.onToggle?.(id, open);
  };

  // Restored ids: replay onToggle(true) once each id exists, so lazy tiers load them.
  const pending = new Set(restored ?? []);
  const replay = () => {
    const index = opts.index();
    for (const id of [...pending]) {
      if (!index.has(id)) continue;
      pending.delete(id);
      opts.onToggle?.(id, true);
    }
  };
  onMount(() => {
    untrack(replay);
    if (opts.pruneUnknown !== false && pending.size) {
      const index = untrack(opts.index);
      const kept = new Set([...own()].filter((id) => index.has(id) || !pending.has(id)));
      pending.clear();
      setOwn(kept);
    }
  });
  if (opts.pruneUnknown === false) {
    createEffect(() => {
      opts.index();
      if (pending.size) untrack(replay);
    });
  }

  if (opts.persistence) {
    const p = opts.persistence;
    let first = true;
    createEffect(() => {
      const current = [...ids()];
      if (first) {
        first = false;
        return; // don't rewrite what we just loaded
      }
      p.save(current);
    });
  }

  return {
    ids,
    isOpen: (id) => ids().has(id),
    set(id, open) {
      const cur = untrack(ids);
      if (cur.has(id) === open) return;
      const next = new Set(cur);
      if (open) next.add(id);
      else next.delete(id);
      commit(next, [[id, open]]);
    },
    openMany(list) {
      const cur = untrack(ids);
      const next = new Set(cur);
      const changes: [string, boolean][] = [];
      for (const id of list) {
        if (next.has(id)) continue;
        next.add(id);
        changes.push([id, true]);
      }
      commit(next, changes);
    },
    closeAll() {
      const cur = untrack(ids);
      commit(new Set(), [...cur].map((id) => [id, false] as [string, boolean]));
    },
  };
}
