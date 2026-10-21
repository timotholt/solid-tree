import { describe, expect, it, vi } from "vitest";
import { supabaseSource } from "../../src/supabase/source.js";
import { fakeSupabase } from "../support/fake-supabase.js";

const toNode = (r: Record<string, any>) => ({ id: String(r.id), label: r.name, type: "row", payload: r });

describe("supabaseSource", () => {
  it("flat: getRoots returns every row ordered by id; no getChildren", async () => {
    const sb = fakeSupabase({ rows: [{ id: 2, name: "b" }, { id: 1, name: "a" }] });
    const src = supabaseSource({ client: sb.client, table: "t", toNode });
    expect((await src.getRoots()).map((x) => x.id)).toEqual(["1", "2"]);
    expect(src.getChildren).toBeUndefined();
  });

  it("hierarchy: roots are parent IS NULL; children by parent", async () => {
    const sb = fakeSupabase({
      rows: [
        { id: "r", name: "root", parent: null },
        { id: "c", name: "child", parent: "r" },
      ],
    });
    const src = supabaseSource({ client: sb.client, table: "t", toNode, parentColumn: "parent" });
    expect((await src.getRoots()).map((x) => x.id)).toEqual(["r"]);
    expect((await src.getChildren!({ id: "r", label: "", type: "row" })).map((x) => x.id)).toEqual(["c"]);
  });

  it("pages through results larger than pageSize", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i, name: `n${i}` }));
    const sb = fakeSupabase({ rows });
    const src = supabaseSource({ client: sb.client, table: "t", toNode, pageSize: 10 });
    expect(await src.getRoots()).toHaveLength(25);
  });

  it("honours orderBy", async () => {
    const sb = fakeSupabase({ rows: [{ id: 1, name: "b" }, { id: 2, name: "a" }] });
    const src = supabaseSource({ client: sb.client, table: "t", toNode, orderBy: { column: "name" } });
    expect((await src.getRoots()).map((x) => x.label)).toEqual(["a", "b"]);
  });

  it("maps realtime INSERT/UPDATE/DELETE to TreeChange", () => {
    const sb = fakeSupabase();
    const src = supabaseSource({ client: sb.client, table: "t", toNode, parentColumn: "parent" });
    const onChange = vi.fn();
    const unsub = src.subscribe!(onChange);
    const fire = sb.channels[0].handler!;
    fire({ eventType: "INSERT", new: { id: "x", name: "X", parent: "r" } });
    fire({ eventType: "UPDATE", new: { id: "x", name: "X2", parent: "r" } });
    fire({ eventType: "DELETE", old: { id: "x" } });
    fire({ eventType: "DELETE", old: {} }); // no id → ignored
    expect(onChange.mock.calls.map((c) => c[0].type)).toEqual(["insert", "update", "remove"]);
    expect(onChange.mock.calls[0][0].parentId).toBe("r");
    unsub();
    expect(sb.channels[0].removed).toBe(true);
  });

  it("realtime: false omits subscribe", () => {
    const sb = fakeSupabase();
    expect(supabaseSource({ client: sb.client, table: "t", toNode, realtime: false }).subscribe).toBeUndefined();
  });
});

it("regression(B3): two sources on the same table use distinct realtime channels", () => {
  const sb = fakeSupabase();
  supabaseSource({ client: sb.client, table: "t", toNode }).subscribe!(() => {});
  supabaseSource({ client: sb.client, table: "t", toNode }).subscribe!(() => {});
  expect(sb.channels[0].topic).not.toBe(sb.channels[1].topic);
});

it("regression(B6): a realtime UPDATE carries the row's parent so moves are detectable", () => {
  const sb = fakeSupabase();
  const src = supabaseSource({ client: sb.client, table: "t", toNode, parentColumn: "parent" });
  const onChange = vi.fn();
  src.subscribe!(onChange);
  sb.channels[0].handler!({ eventType: "UPDATE", new: { id: "x", name: "X", parent: "r2" } });
  expect(onChange.mock.calls[0][0].parentId).toBe("r2");
});

describe("supabaseSource keyset pagination (D12)", () => {
  it("never skips or repeats rows when rows are inserted before the cursor mid-load", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${String(i).padStart(3, "0")}`, name: `n${i}` }));
    const sb = fakeSupabase({ rows });
    let inserted = 0;
    sb.betweenPages(() => {
      // Another user inserts rows that sort BEFORE the cursor; offset paging would
      // shift and repeat rows, keyset paging must not.
      if (inserted < 3) sb.setRows([{ id: `a${inserted++}`, name: "early" }, ...rows]);
    });
    const src = supabaseSource({ client: sb.client, table: "t", toNode, pageSize: 10 });
    const got = (await src.getRoots()).map((x) => x.id);
    expect(new Set(got).size).toBe(got.length);
    for (const r of rows) expect(got).toContain(r.id);
  });

  it("keyset on a non-id order column ties broken by id, with awkward values", async () => {
    const rows = [
      { id: "1", name: 'b,"x"' },
      { id: "2", name: "a" },
      { id: "3", name: 'b,"x"' },
      { id: "4", name: "c" },
    ];
    const sb = fakeSupabase({ rows });
    const src = supabaseSource({ client: sb.client, table: "t", toNode, orderBy: { column: "name" }, pageSize: 1 });
    expect((await src.getRoots()).map((x) => x.id)).toEqual(["2", "1", "3", "4"]);
  });

  it("descending order pages correctly", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: `n${i}` }));
    const sb = fakeSupabase({ rows });
    const src = supabaseSource({ client: sb.client, table: "t", toNode, orderBy: { column: "id", ascending: false }, pageSize: 3 });
    expect((await src.getRoots()).map((x) => x.id)).toEqual(["6", "5", "4", "3", "2", "1", "0"]);
  });
});
