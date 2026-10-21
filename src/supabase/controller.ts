import { createSignal, mergeProps, onCleanup, type Accessor } from "solid-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/solid-query";
import { type TreeNodeData, type TreeSource } from "../types.js";
import {
  createDatabaseTreeController,
  type DatabaseTreeController,
} from "../database/createDatabaseTreeController.js";
import { pickCore, type CoreControllerOptions } from "../controller/index.js";
import { supabaseSource, type SupabaseSourceConfig } from "./source.js";
import { createSupabaseLock } from "./lock.js";

export interface SupabaseTreeControllerOptions extends CoreControllerOptions {
  client: SupabaseClient;
  /**
   * Inject a ready-made source — for multi-table / synthetic trees that a single
   * `supabaseSource(table)` can't express (e.g. roots joined from two tables, or
   * pre-nested children built at load). When provided, `table`/`toNode` and the other
   * supabaseSource knobs are ignored; you own getRoots/getChildren/subscribe. The lock
   * still uses `client` and the realtime stream is tee'd into it for live lock-loss.
   * Omit to build a source from `table`/`toNode` via {@link supabaseSource}.
   */
  source?: TreeSource;
  table?: string;
  toNode?: SupabaseSourceConfig["toNode"];
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
  // (core options — selectedId/searchQuery/matcher/filterMode/onSelect/onToggle/
  //  storageKey/storagePrefix — come from CoreControllerOptions)
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
  // Injected source wins; otherwise build a single-table one from table/toNode.
  if (!opts.source && (!opts.table || !opts.toNode))
    throw new Error("createSupabaseTreeController: provide either `source` or both `table` and `toNode`");
  const base: TreeSource =
    opts.source ??
    supabaseSource({
      client: opts.client,
      table: opts.table!,
      toNode: opts.toNode!,
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

  const db = createDatabaseTreeController(
    mergeProps(pickCore(opts), {
      source,
      get queryClient() {
        return opts.queryClient;
      },
    })
  );

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
