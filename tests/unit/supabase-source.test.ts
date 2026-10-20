import { describe, expect, it, vi } from "vitest";
import { supabaseSource } from "../../src/supabase/source.js";
import { knownDefect } from "../support/known-defect.js";
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

knownDefect("B3", "two sources on the same table use distinct realtime channels", () => {
  const sb = fakeSupabase();
  supabaseSource({ client: sb.client, table: "t", toNode }).subscribe!(() => {});
  supabaseSource({ client: sb.client, table: "t", toNode }).subscribe!(() => {});
  expect(sb.channels[0].topic).not.toBe(sb.channels[1].topic);
});

knownDefect("B6", "a realtime UPDATE carries the row's parent so moves are detectable", () => {
  const sb = fakeSupabase();
  const src = supabaseSource({ client: sb.client, table: "t", toNode, parentColumn: "parent" });
  const onChange = vi.fn();
  src.subscribe!(onChange);
  sb.channels[0].handler!({ eventType: "UPDATE", new: { id: "x", name: "X", parent: "r2" } });
  expect(onChange.mock.calls[0][0].parentId).toBe("r2");
});
