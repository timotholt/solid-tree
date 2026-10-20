import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { QueryClient } from "@tanstack/solid-query";
import { DatabaseTree } from "../../src/DatabaseTree.js";
import { SupabaseTree } from "../../src/supabase/SupabaseTree.js";
import { fakeSource } from "../support/fake-source.js";
import { fakeSupabase } from "../support/fake-supabase.js";
import { n } from "../support/fixtures.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const settle = async () => {
  for (let i = 0; i < 6; i++) await frame();
};
const rows = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[role='treeitem']"));
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("<DatabaseTree>", () => {
  it("renders roots, a styled loading placeholder, then lazily loaded children", async () => {
    const fake = fakeSource([n("a"), n("b")], { a: [n("a1")] });
    fake.hold("a");
    const { container } = render(() => (
      <DatabaseTree source={fake.source} queryClient={qc()} viewportStyle={{ height: "200px" }} />
    ));
    await settle();
    expect(rows(container).map((r) => r.dataset.treeId)).toEqual(["a", "b"]);
    rows(container)[0].click();
    await settle();
    expect(container.querySelector(".solid-tree-loading")!.textContent).toBe("Loading…");
    fake.release("a");
    await settle();
    expect(rows(container).map((r) => r.dataset.treeId)).toEqual(["a", "a1", "b"]);
  });

  it("passes renderLabel through for real nodes", async () => {
    const fake = fakeSource([n("a")]);
    const { container } = render(() => (
      <DatabaseTree
        source={fake.source}
        queryClient={qc()}
        viewportStyle={{ height: "200px" }}
        renderLabel={(node) => <i>{node.id.toUpperCase()}</i>}
      />
    ));
    await settle();
    expect(container.querySelector("i")!.textContent).toBe("A");
  });
});

describe("<SupabaseTree>", () => {
  it("renders a table through the supabase source", async () => {
    const sb = fakeSupabase({ rows: [{ id: 1, name: "one" }, { id: 2, name: "two" }] });
    const { container } = render(() => (
      <SupabaseTree
        client={sb.client}
        table="t"
        toNode={(r) => ({ id: String(r.id), label: r.name, type: "row", payload: r })}
        queryClient={qc()}
        viewportStyle={{ height: "200px" }}
      />
    ));
    await settle();
    expect(rows(container).map((r) => r.textContent)).toEqual(["one", "two"]);
  });
});
