import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/solid-query";
import { type TreeNodeData, type TreeSource, type TreeMatcher } from "../types.js";
import {
  createDatabaseTreeController,
  type DatabaseTreeController,
} from "../DatabaseTreeController.js";
import { supabaseSource, type SupabaseSourceConfig } from "./source.js";
import { createSupabaseLock } from "./lock.js";

export interface SupabaseTreeControllerOptions {
  client: SupabaseClient;
  table: string;
  toNode: SupabaseSourceConfig["toNode"];
  idColumn?: string;
  parentColumn?: string;
  select?: string;
  orderBy?: SupabaseSourceConfig["orderBy"];
  schema?: string;
  realtime?: boolean;
  pageSize?: number;
  queryClient?: QueryClient;

  // ── lock ─────────────────────────────────────────────────────────────────
  /** Heartbeat interval (ms). Default 30s. */
  heartbeatMs?: number;
  /** Override the lock RPC names / id arg if yours differ. */
  lockRpc?: { acquireFn?: string; releaseFn?: string; releaseAllFn?: string; touchFn?: string; idArg?: string };
  /** Fired when a held lock is lost (heartbeat fail, or realtime shows it moved off us). */
  onLockLost?: (id: string) => void;
  /** Extract the lock owner from a node, for realtime lock-loss detection. */
  lockedBy?: (node: TreeNodeData) => string | null;

  // ── forwarded to the core/db controller ──────────────────────────────────
  selectedId?: Accessor<string | null | undefined>;
  searchQuery?: Accessor<string | undefined>;
  matcher?: TreeMatcher;
  filterMode?: "prune" | "dim";
  onSelect?: (node: TreeNodeData) => void;
  onToggle?: (id: string, expanded: boolean) => void;
  storageKey?: string;
  storagePrefix?: string;
}

/** {@link DatabaseTreeController} plus collaborative record locking. */
export interface SupabaseTreeController extends DatabaseTreeController {
  heldId: Accessor<string | null>;
  acquireLock(id: string): Promise<boolean>;
  releaseLock(): Promise<void>;
  releaseAllLocks(): Promise<void>;
  refreshLock(): Promise<void>;
}

/**
 * `<DatabaseTreeController>` wired to a Supabase table + a record lock: async
 * roots/children, realtime, and server-enforced "one editor per record" locking via
 * the SECURITY DEFINER RPCs (see ../../docs/SPEC-locking.md). The realtime stream is
 * tee'd into the lock so an expired/reassigned hold is detected live.
 *
 * MUST be called inside a component body or createRoot.
 */
export function createSupabaseTreeController(opts: SupabaseTreeControllerOptions): SupabaseTreeController {
  const [held, setHeld] = createSignal<string | null>(null);

  const lock = createSupabaseLock({
    client: opts.client,
    heartbeatMs: opts.heartbeatMs,
    onLockLost: (id) => {
      if (held() === id) setHeld(null);
      opts.onLockLost?.(id);
    },
    ...opts.lockRpc,
  });
  onCleanup(() => lock.dispose());

  const lockedByOf =
    opts.lockedBy ?? ((n: TreeNodeData) => (n.payload?.lockedBy ?? n.payload?.locked_by ?? null) as string | null);

  // Source, with its realtime stream tee'd into the lock for live lock-loss detection.
  const base = supabaseSource({
    client: opts.client,
    table: opts.table,
    toNode: opts.toNode,
    idColumn: opts.idColumn,
    parentColumn: opts.parentColumn,
    select: opts.select,
    orderBy: opts.orderBy,
    schema: opts.schema,
    realtime: opts.realtime,
    pageSize: opts.pageSize,
  });
  const source: TreeSource = {
    ...base,
    subscribe: base.subscribe
      ? (onChange) =>
          base.subscribe!((c) => {
            onChange(c);
            if (c.type === "update") lock.observe({ id: c.node.id, locked_by: lockedByOf(c.node) });
          })
      : undefined,
  };

  const db = createDatabaseTreeController({
    source,
    queryClient: opts.queryClient,
    selectedId: opts.selectedId,
    searchQuery: opts.searchQuery,
    matcher: opts.matcher,
    filterMode: opts.filterMode,
    onSelect: opts.onSelect,
    onToggle: opts.onToggle,
    storageKey: opts.storageKey,
    storagePrefix: opts.storagePrefix,
  });

  return {
    ...db,
    heldId: held,
    acquireLock: async (id) => {
      const ok = await lock.acquire(id);
      setHeld(lock.held());
      return ok;
    },
    releaseLock: async () => {
      await lock.release();
      setHeld(lock.held());
    },
    releaseAllLocks: async () => {
      await lock.releaseAll();
      setHeld(lock.held());
    },
    refreshLock: async () => {
      await lock.refresh();
    },
  };
}
