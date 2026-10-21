import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/solid-query";
import { createSupabaseTreeController } from "../../src/supabase/controller.js";
import { fakeSupabase } from "../support/fake-supabase.js";
import { fakeSource } from "../support/fake-source.js";
import { flush, inRoot } from "../support/root.js";
import { n } from "../support/fixtures.js";

const toNode = (r: Record<string, any>) => ({ id: String(r.id), label: r.name, type: "row", payload: r });
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const ids = (t: { flatRows: () => { node: { id: string } }[] }) => t.flatRows().map((r) => r.node.id);

describe("createSupabaseTreeController", () => {
  it("requires either source or table + toNode", () => {
    const sb = fakeSupabase();
    expect(() => inRoot(() => createSupabaseTreeController({ client: sb.client }))).toThrow(/provide either/);
  });

  it("builds a source from table/toNode and loads roots", async () => {
    const sb = fakeSupabase({ rows: [{ id: 1, name: "a" }, { id: 2, name: "b" }] });
    const t = inRoot(() => createSupabaseTreeController({ client: sb.client, table: "t", toNode, queryClient: qc() }));
    await flush();
    expect(ids(t)).toEqual(["1", "2"]);
    t.dispose();
  });

  it("acquireLock / releaseLock keep heldId in sync", async () => {
    const sb = fakeSupabase({ rows: [{ id: 1, name: "a" }] });
    sb.onRpc("acquire_lock", async () => ({ data: { locked_by: "me" }, error: null }));
    const t = inRoot(() => createSupabaseTreeController({ client: sb.client, table: "t", toNode, queryClient: qc() }));
    expect(await t.acquireLock("1")).toBe(true);
    expect(t.heldId()).toBe("1");
    await t.refreshLock();
    await t.releaseLock();
    expect(t.heldId()).toBeNull();
    await t.acquireLock("1");
    await t.releaseAllLocks();
    expect(t.heldId()).toBeNull();
    t.dispose();
  });

  it("an injected source wins, and its realtime stream is tee'd into the lock", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", async () => ({ data: { locked_by: "me" }, error: null }));
    const fake = fakeSource([n("x")]);
    const onLockLost = vi.fn();
    const t = inRoot(() =>
      createSupabaseTreeController({ client: sb.client, source: fake.source, onLockLost, queryClient: qc() })
    );
    await flush();
    expect(ids(t)).toEqual(["x"]);
    await t.acquireLock("x");
    fake.emit({ type: "update", node: { ...n("x"), payload: { locked_by: "someone-else" } } });
    expect(onLockLost).toHaveBeenCalledWith("x");
    expect(t.heldId()).toBeNull();
    t.dispose();
  });

  it("a custom lockedBy extractor is used for lock-loss detection", async () => {
    const sb = fakeSupabase();
    sb.onRpc("acquire_lock", async () => ({ data: { locked_by: "me" }, error: null }));
    const fake = fakeSource([n("x")]);
    const onLockLost = vi.fn();
    const t = inRoot(() =>
      createSupabaseTreeController({
        client: sb.client,
        source: fake.source,
        onLockLost,
        lockedBy: (node) => node.payload?.owner ?? null,
        queryClient: qc(),
      })
    );
    await flush();
    await t.acquireLock("x");
    fake.emit({ type: "update", node: { ...n("x"), payload: { owner: "me" } } });
    expect(onLockLost).not.toHaveBeenCalled();
    fake.emit({ type: "update", node: { ...n("x"), payload: { owner: "bob" } } });
    expect(onLockLost).toHaveBeenCalledWith("x");
    t.dispose();
  });
});

import { expectTypeOf } from "vitest";
import { SUPABASE_OPTION_KEYS, type SupabaseTreeControllerOptions } from "../../src/supabase/controller.js";
import type { CoreControllerOptions } from "../../src/controller/index.js";
import type { SupabaseTreeProps } from "../../src/supabase/SupabaseTree.js";

describe("<SupabaseTree> option surface (D3)", () => {
  it("SUPABASE_OPTION_KEYS covers exactly the non-core controller options", () => {
    type Own = Exclude<keyof SupabaseTreeControllerOptions, keyof CoreControllerOptions>;
    expectTypeOf<(typeof SUPABASE_OPTION_KEYS)[number]>().toEqualTypeOf<Own>();
  });
  it("props expose the previously missing lock options", () => {
    expectTypeOf<SupabaseTreeProps>().toHaveProperty("lockRpc");
    expectTypeOf<SupabaseTreeProps>().toHaveProperty("lockedBy");
    expectTypeOf<SupabaseTreeProps>().toHaveProperty("heartbeatPolicy");
  });
});
