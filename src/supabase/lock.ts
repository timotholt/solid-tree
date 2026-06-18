import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Config for {@link createSupabaseLock} — the client side of the "one editor per
 * record" lock. It calls the SECURITY DEFINER RPCs documented in
 * ../../docs/SPEC-locking.md (default names acquire_lock/touch_lock/release_lock).
 * Enforcement is server-side (RLS + RPC on auth.uid()); this just drives them and
 * keeps the heartbeat alive so an idle/closed client's lock expires ("use it or lose it").
 */
export interface SupabaseLockConfig {
  client: SupabaseClient;
  /** RPC names — override if yours differ. */
  acquireFn?: string; // default "acquire_lock"
  releaseFn?: string; // default "release_lock"
  releaseAllFn?: string; // default "release_all_locks"
  touchFn?: string; // default "touch_lock"
  /** The id argument name the RPCs take. Default "_id". */
  idArg?: string;
  /** Heartbeat interval (ms). Should be well under the server TTL. Default 30s. */
  heartbeatMs?: number;
  /** Fired when we lose a lock we held (heartbeat failed, or realtime shows it moved off us). */
  onLockLost?: (id: string) => void;
}

export interface SupabaseLock {
  /** Try to take the lock for `id`. Resolves true if we now hold it. Releases any prior hold. */
  acquire(id: string): Promise<boolean>;
  /** Release whatever we currently hold. */
  release(): Promise<void>;
  /** Release every lock this user holds server-side (clean slate on mount/sign-out). */
  releaseAll(): Promise<void>;
  /** The id we currently hold, or null. */
  held(): string | null;
  /**
   * Feed realtime row updates here. If our held row's `locked_by` is no longer us
   * (server expired/reassigned it), we treat the lock as lost.
   */
  observe(row: { id: string; locked_by: string | null }): void;
  /** Stop the heartbeat. Call on unmount. */
  dispose(): void;
}

export function createSupabaseLock(cfg: SupabaseLockConfig): SupabaseLock {
  const acquireFn = cfg.acquireFn ?? "acquire_lock";
  const releaseFn = cfg.releaseFn ?? "release_lock";
  const releaseAllFn = cfg.releaseAllFn ?? "release_all_locks";
  const touchFn = cfg.touchFn ?? "touch_lock";
  const idArg = cfg.idArg ?? "_id";
  const beatMs = cfg.heartbeatMs ?? 30_000;

  let heldId: string | null = null;
  let userId: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const uid = async () => {
    if (userId) return userId;
    const { data } = await cfg.client.auth.getUser();
    userId = data.user?.id ?? null;
    return userId;
  };

  const stopBeat = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const lost = () => {
    const id = heldId;
    heldId = null;
    stopBeat();
    if (id) cfg.onLockLost?.(id);
  };

  const startBeat = () => {
    stopBeat();
    timer = setInterval(async () => {
      if (!heldId) return;
      // Idle (tab unfocused) → skip the beat so the lock expires server-side.
      if (typeof document !== "undefined" && !document.hasFocus()) return;
      const { error } = await cfg.client.rpc(touchFn, { [idArg]: heldId });
      if (error) lost();
    }, beatMs);
  };

  return {
    held: () => heldId,

    async acquire(id) {
      const me = await uid();
      const { data, error } = await cfg.client.rpc(acquireFn, { [idArg]: id });
      // Refused → null / null-composite (object of null fields). Success → our row.
      const got = !error && !!data && (data as any).locked_by === me;
      if (!got) return false;
      if (heldId && heldId !== id) await cfg.client.rpc(releaseFn, { [idArg]: heldId });
      heldId = id;
      startBeat();
      return true;
    },

    async release() {
      const id = heldId;
      heldId = null;
      stopBeat();
      if (id) await cfg.client.rpc(releaseFn, { [idArg]: id });
    },

    async releaseAll() {
      heldId = null;
      stopBeat();
      await cfg.client.rpc(releaseAllFn);
    },

    observe(row) {
      if (heldId && row.id === heldId && row.locked_by !== userId) lost();
    },

    dispose() {
      stopBeat();
    },
  };
}
