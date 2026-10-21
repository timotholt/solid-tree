import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseLock } from "../../src/supabase/lock.js";
import { fakeSupabase } from "../support/fake-supabase.js";

const granted = (owner: string) => async () => ({ data: { locked_by: owner }, error: null });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSupabaseLock", () => {
  it("acquire succeeds when the RPC returns our row", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    const lock = createSupabaseLock({ client: sb.client });
    expect(await lock.acquire("x")).toBe(true);
    expect(lock.held()).toBe("x");
    expect(sb.rpcCalls[0]).toEqual({ fn: "acquire_lock", args: { _id: "x" } });
    lock.dispose();
  });

  it("acquire fails when refused (null or someone else's row)", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("other"));
    const lock = createSupabaseLock({ client: sb.client });
    expect(await lock.acquire("x")).toBe(false);
    expect(lock.held()).toBeNull();
  });

  it("acquire fails on RPC error", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", async () => ({ data: null, error: { message: "boom" } }));
    const lock = createSupabaseLock({ client: sb.client });
    expect(await lock.acquire("x")).toBe(false);
  });

  it("heartbeats while held and focused; a failed beat loses the lock", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    const onLockLost = vi.fn();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const lock = createSupabaseLock({ client: sb.client, heartbeatMs: 1000, onLockLost });
    await lock.acquire("x");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sb.rpcCalls.filter((c) => c.fn === "touch_lock")).toHaveLength(1);
    sb.onRpc("touch_lock", async () => ({ data: null, error: { message: "expired" } }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onLockLost).toHaveBeenCalledWith("x");
    expect(lock.held()).toBeNull();
  });

  // Rewritten against heartbeatPolicy (D11): skipping while unfocused is now opt-in.
  it("heartbeatPolicy 'focused' skips beats while the window is unfocused", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const lock = createSupabaseLock({ client: sb.client, heartbeatMs: 1000, heartbeatPolicy: "focused" });
    await lock.acquire("x");
    await vi.advanceTimersByTimeAsync(3000);
    expect(sb.rpcCalls.filter((c) => c.fn === "touch_lock")).toHaveLength(0);
    lock.dispose();
  });

  it("release / releaseAll / refresh call their RPCs", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    const lock = createSupabaseLock({ client: sb.client });
    await lock.acquire("x");
    await lock.refresh();
    await lock.release();
    await lock.releaseAll();
    expect(sb.rpcCalls.map((c) => c.fn)).toEqual(["acquire_lock", "touch_lock", "release_lock", "release_all_locks"]);
    expect(lock.held()).toBeNull();
  });

  it("observe() loses the lock when realtime shows another holder", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    const onLockLost = vi.fn();
    const lock = createSupabaseLock({ client: sb.client, onLockLost });
    await lock.acquire("x");
    lock.observe({ id: "x", locked_by: "me" });
    expect(lock.held()).toBe("x");
    lock.observe({ id: "x", locked_by: "other" });
    expect(onLockLost).toHaveBeenCalledWith("x");
  });

  it("custom RPC names and id argument", async () => {
    const sb = fakeSupabase();
    sb.onRpc("grab", granted("me"));
    const lock = createSupabaseLock({ client: sb.client, acquireFn: "grab", idArg: "rid" });
    await lock.acquire("x");
    expect(sb.rpcCalls[0]).toEqual({ fn: "grab", args: { rid: "x" } });
    lock.dispose();
  });
});

it("regression(B8): the lock re-reads the user after an auth change", async () => {
  const sb = fakeSupabase({ user: "alice" });
  // The server stamps locked_by with whoever is authenticated now.
  sb.onRpc("acquire_lock", async () => ({ data: { locked_by: sb.user }, error: null }));
  const lock = createSupabaseLock({ client: sb.client });
  await lock.acquire("x");
  await lock.release();
  sb.switchUser("bob");
  expect(await lock.acquire("y")).toBe(true);
  lock.dispose();
});

it("regression(B8): concurrent acquire calls are serialized", async () => {
  const sb = fakeSupabase();
  let inFlight = 0;
  let maxInFlight = 0;
  sb.onRpc("acquire_lock", async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    return { data: { locked_by: "me" }, error: null };
  });
  const lock = createSupabaseLock({ client: sb.client });
  await Promise.all([lock.acquire("x"), lock.acquire("y")]);
  expect(maxInFlight).toBe(1);
  lock.dispose();
});

it("regression(B8): heartbeats never overlap when a beat is slow", async () => {
  const sb = fakeSupabase();
  sb.onRpc("acquire_lock", granted("me"));
  let inFlight = 0;
  let maxInFlight = 0;
  sb.onRpc("touch_lock", async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 2500));
    inFlight--;
    return { data: null, error: null };
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const lock = createSupabaseLock({ client: sb.client, heartbeatMs: 1000 });
  await lock.acquire("x");
  await vi.advanceTimersByTimeAsync(5000);
  expect(maxInFlight).toBe(1);
  lock.dispose();
});

it("regression(G4): dispose releases a held lock", async () => {
  const sb = fakeSupabase();
  sb.onRpc("acquire_lock", granted("me"));
  const lock = createSupabaseLock({ client: sb.client });
  await lock.acquire("x");
  lock.dispose();
  await vi.runAllTimersAsync();
  expect(sb.rpcCalls.map((c) => c.fn)).toContain("release_lock");
});

describe("phase 6 — lock lifecycle", () => {
  it("default heartbeat policy beats even while unfocused (D11)", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const lock = createSupabaseLock({ client: sb.client, heartbeatMs: 1000 });
    await lock.acquire("x");
    await vi.advanceTimersByTimeAsync(2000);
    expect(sb.rpcCalls.filter((c) => c.fn === "touch_lock")).toHaveLength(2);
    lock.dispose();
  });

  it("a custom heartbeat policy decides per beat", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    let allow = false;
    const lock = createSupabaseLock({ client: sb.client, heartbeatMs: 1000, heartbeatPolicy: () => allow });
    await lock.acquire("x");
    await vi.advanceTimersByTimeAsync(1000);
    allow = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(sb.rpcCalls.filter((c) => c.fn === "touch_lock")).toHaveLength(1);
    lock.dispose();
  });

  it("signing in as someone else drops the previous user's lock", async () => {
    const sb = fakeSupabase({ user: "alice" });
    sb.onRpc("acquire_lock", async () => ({ data: { locked_by: sb.user }, error: null }));
    const onLockLost = vi.fn();
    const lock = createSupabaseLock({ client: sb.client, onLockLost });
    await lock.acquire("x");
    sb.switchUser("bob");
    expect(onLockLost).toHaveBeenCalledWith("x");
    expect(lock.held()).toBeNull();
    lock.dispose();
  });

  it("onHeldChange reports every change of the held id", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    const changes: (string | null)[] = [];
    const lock = createSupabaseLock({ client: sb.client, onHeldChange: (id) => changes.push(id) });
    await lock.acquire("x");
    await lock.acquire("y");
    await lock.release();
    expect(changes).toEqual(["x", "y", null]);
    lock.dispose();
  });

  it("pagehide releases the held lock with a keepalive request", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    const lock = createSupabaseLock({ client: sb.client });
    await lock.acquire("x");
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://fake.supabase.co/rest/v1/rpc/release_lock",
      expect.objectContaining({ method: "POST", keepalive: true, body: JSON.stringify({ _id: "x" }) })
    );
    lock.dispose();
    fetchSpy.mockRestore();
  });

  it("releaseOnDispose: false keeps the lock and attaches no pagehide listener", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", granted("me"));
    const add = vi.spyOn(window, "addEventListener");
    const lock = createSupabaseLock({ client: sb.client, releaseOnDispose: false });
    await lock.acquire("x");
    lock.dispose();
    await vi.runAllTimersAsync();
    expect(sb.rpcCalls.map((c) => c.fn)).not.toContain("release_lock");
    expect(add).not.toHaveBeenCalledWith("pagehide", expect.anything());
    add.mockRestore();
  });

  it("dispose detaches the auth listener", () => {
    const sb = fakeSupabase();
    const lock = createSupabaseLock({ client: sb.client });
    expect(sb.authListenerCount).toBe(1);
    lock.dispose();
    expect(sb.authListenerCount).toBe(0);
  });
});
