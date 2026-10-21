import type { SupabaseClient } from "@supabase/supabase-js";

/** When the heartbeat should actually beat. */
export type HeartbeatPolicy = "always" | "focused" | ((ctx: { heldId: string }) => boolean);

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
  /**
   * Default "always". "focused" skips beats while the window is unfocused, so a lock
   * held by an idle background tab expires (the pre-0.17 behavior) (ANALYSIS D11).
   */
  heartbeatPolicy?: HeartbeatPolicy;
  /** Release the held lock on dispose() and on `pagehide`. Default true (ANALYSIS G4). */
  releaseOnDispose?: boolean;
  /** Fired when we lose a lock we held (heartbeat failed, or realtime shows it moved off us). */
  onLockLost?: (id: string) => void;
  /** Fired whenever the held id changes (the single source of lock state — D10). */
  onHeldChange?: (id: string | null) => void;
}

export interface SupabaseLock {
  /** Try to take the lock for `id`. Resolves true if we now hold it. Releases any prior hold. */
  acquire(id: string): Promise<boolean>;
  /** Release whatever we currently hold. */
  release(): Promise<void>;
  /** Release every lock this user holds server-side (clean slate on mount/sign-out). */
  releaseAll(): Promise<void>;
  /** Manually beat the heartbeat for the held lock (extends its TTL). */
  refresh(): Promise<void>;
  /** The id we currently hold, or null. */
  held(): string | null;
  /**
   * Feed realtime row updates here. If our held row's `locked_by` is no longer us
   * (server expired/reassigned it), we treat the lock as lost.
   */
  observe(row: { id: string; locked_by: string | null }): void;
  /** Stop the heartbeat, release (if `releaseOnDispose`), detach listeners. */
  dispose(): void;
}

export function createSupabaseLock(cfg: SupabaseLockConfig): SupabaseLock {
  const acquireFn = cfg.acquireFn ?? "acquire_lock";
  const releaseFn = cfg.releaseFn ?? "release_lock";
  const releaseAllFn = cfg.releaseAllFn ?? "release_all_locks";
  const touchFn = cfg.touchFn ?? "touch_lock";
  const idArg = cfg.idArg ?? "_id";
  const beatMs = cfg.heartbeatMs ?? 30_000;
  const policy = cfg.heartbeatPolicy ?? "always";
  const releaseOnDispose = cfg.releaseOnDispose !== false;

  let heldId: string | null = null;
  const setHeld = (id: string | null) => {
    if (heldId === id) return;
    heldId = id;
    cfg.onHeldChange?.(id);
  };

  // ── auth: never trust a cached user across sign-in/out (ANALYSIS B8) ─────────
  let userId: string | null = null;
  let accessToken: string | null = null;
  const auth = cfg.client.auth as SupabaseClient["auth"] & Partial<{ onAuthStateChange: SupabaseClient["auth"]["onAuthStateChange"] }>;
  const authSub = auth.onAuthStateChange?.((_event, session) => {
    const next = session?.user?.id ?? null;
    accessToken = session?.access_token ?? null;
    if (next !== userId) {
      userId = next;
      // A lock held by the previous user is not ours any more.
      if (heldId) lost();
    }
  });
  void auth.getSession?.().then(({ data }) => {
    accessToken ??= data.session?.access_token ?? null;
  });
  const uid = async () => {
    if (userId) return userId;
    const { data } = await cfg.client.auth.getUser();
    userId = data.user?.id ?? null;
    return userId;
  };

  // ── serialize acquire/release/releaseAll (ANALYSIS B8) ───────────────────────
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  // ── single-flight heartbeat (ANALYSIS B8) ───────────────────────────────────
  let timer: ReturnType<typeof setTimeout> | null = null;
  let beating = false;
  const stopBeat = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const shouldBeat = (id: string) => {
    if (policy === "always") return true;
    if (policy === "focused") return typeof document === "undefined" || document.hasFocus();
    return policy({ heldId: id });
  };
  const beat = async () => {
    timer = null;
    const id = heldId;
    if (!id) return;
    if (!beating && shouldBeat(id)) {
      beating = true;
      try {
        const { error } = await cfg.client.rpc(touchFn, { [idArg]: id });
        if (error && heldId === id) lost();
      } finally {
        beating = false;
      }
    }
    if (heldId) timer = setTimeout(beat, beatMs); // next beat only after this one settles
  };
  const startBeat = () => {
    stopBeat();
    timer = setTimeout(beat, beatMs);
  };

  const lost = () => {
    const id = heldId;
    setHeld(null);
    stopBeat();
    if (id) cfg.onLockLost?.(id);
  };

  // ── release when the page goes away (ANALYSIS G4) ───────────────────────────
  const onPageHide = () => {
    if (!heldId || !accessToken) return;
    const c = cfg.client as unknown as { supabaseUrl?: string; supabaseKey?: string; rest?: { url?: string } };
    const base = c.rest?.url ?? (c.supabaseUrl ? `${c.supabaseUrl}/rest/v1` : null);
    if (!base || !c.supabaseKey) return;
    // keepalive lets the request outlive the page; supabase-js cannot do that.
    void fetch(`${base}/rpc/${releaseFn}`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: c.supabaseKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ [idArg]: heldId }),
    }).catch(() => undefined);
  };
  if (releaseOnDispose && typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);

  const doRelease = async () => {
    const id = heldId;
    setHeld(null);
    stopBeat();
    if (id) await cfg.client.rpc(releaseFn, { [idArg]: id });
  };

  return {
    held: () => heldId,

    acquire: (id) =>
      serial(async () => {
        const me = await uid();
        const { data, error } = await cfg.client.rpc(acquireFn, { [idArg]: id });
        // Refused → null / null-composite (object of null fields). Success → our row.
        const got = !error && !!data && (data as { locked_by?: string }).locked_by === me;
        if (!got) return false;
        // The reference acquire_lock SQL already releases our other locks atomically;
        // this covers custom RPCs that do not.
        if (heldId && heldId !== id) await cfg.client.rpc(releaseFn, { [idArg]: heldId });
        setHeld(id);
        startBeat();
        return true;
      }),

    release: () => serial(doRelease),

    releaseAll: () =>
      serial(async () => {
        setHeld(null);
        stopBeat();
        await cfg.client.rpc(releaseAllFn);
      }),

    async refresh() {
      const id = heldId;
      if (!id) return;
      const { error } = await cfg.client.rpc(touchFn, { [idArg]: id });
      if (error && heldId === id) lost();
    },

    observe(row) {
      if (heldId && row.id === heldId && row.locked_by !== userId) lost();
    },

    dispose() {
      stopBeat();
      authSub?.data.subscription.unsubscribe();
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
      if (releaseOnDispose && heldId) void serial(doRelease);
    },
  };
}
