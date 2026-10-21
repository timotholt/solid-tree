import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import axe from "axe-core";
import { QueryClient } from "@tanstack/solid-query";
import { Tree } from "../../src/view/Tree.js";
import { VirtualTree } from "../../src/view/VirtualTree.js";
import { DatabaseTree } from "../../src/database/DatabaseTree.js";
import { createTreeController } from "../../src/controller/index.js";
import { createMemorySource } from "../../src/testing.js";
import { n, produce, wide } from "../support/fixtures.js";

// E7: automated WAI-ARIA checks (axe-core) on every view and state in a real browser.
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const settle = async () => {
  for (let i = 0; i < 6; i++) await frame();
};

async function expectNoViolations(root: Element) {
  const result = await axe.run(root, { resultTypes: ["violations"] });
  const summary = result.violations.flatMap((v) => v.nodes.map((nd) => `${v.id} — ${nd.failureSummary?.split("\n")[1]?.trim()} — ${nd.target.join(" ")} — ${nd.html.slice(0, 160)}`));
  expect(summary).toEqual([]);
}

const rich = () => [
  n("docs", [n("readme", undefined, { label: "README.md", count: 3 }), n("guide", undefined, { label: "Guide", disabled: true })], { label: "Docs", iconLeft: "📁" }),
  n("sep", undefined, { isDivider: true, label: "" }),
  n("src", [n("index", undefined, { label: "index.ts" })], { label: "Source" }),
  n("add", undefined, { label: "+ Add", variant: "action" }),
];

describe("axe: <Tree>", () => {
  it("collapsed, expanded, selected, with separators, counts, icons, disabled and action rows", async () => {
    const { container } = render(() => <Tree data={rich()} onSelect={() => {}} ariaLabel="Files" selectedId="readme" />);
    await settle();
    await expectNoViolations(container);
  });

  it("with an actions slot (buttons beside each treeitem)", async () => {
    const { container } = render(() => (
      <Tree data={produce()} ariaLabel="Produce" renderActionNode={(node) => <button aria-label={`Delete ${node.label}`}>✕</button>} />
    ));
    await expectNoViolations(container);
  });

  it("while searching (prune and dim) and with no matches", async () => {
    for (const [query, mode] of [["straw", "prune"], ["carrot", "dim"], ["kiwi", "prune"]] as const) {
      const { container, unmount } = render(() => <Tree data={produce()} ariaLabel="Produce" searchQuery={query} filterMode={mode} />);
      await expectNoViolations(container);
      unmount();
    }
  });

  it("multiple selection", async () => {
    const { container } = render(() => <Tree data={produce()} ariaLabel="Produce" selectionMode="multiple" selectedIds={["fruit", "veg"]} />);
    await expectNoViolations(container);
  });

  it("right-to-left", async () => {
    const { container } = render(() => <Tree data={produce()} ariaLabel="Produce" dir="rtl" />);
    await expectNoViolations(container);
  });
});

describe("axe: <VirtualTree>", () => {
  it("a large expanded tree, before and after scrolling", async () => {
    let t!: ReturnType<typeof createTreeController>;
    const { container } = render(() => {
      t = createTreeController({ data: () => wide(10, 3) });
      return <VirtualTree tree={t} ariaLabel="Big" viewportStyle={{ height: "300px" }} />;
    });
    t.expandAll();
    await settle();
    await expectNoViolations(container);
    container.querySelector<HTMLElement>(".solid-tree-viewport")!.scrollTop = 6000;
    await settle();
    await expectNoViolations(container);
  });
});

describe("axe: <DatabaseTree>", () => {
  it("loading, loaded, a loading branch and an error branch", async () => {
    const source = createMemorySource(produce(), { latency: 30 });
    const { container } = render(() => (
      <DatabaseTree source={source} queryClient={new QueryClient()} ariaLabel="Remote" viewportStyle={{ height: "300px" }} />
    ));
    await expectNoViolations(container); // roots loading
    await new Promise((r) => setTimeout(r, 60));
    await settle();
    await expectNoViolations(container);
    source.fail("veg");
    const veg = container.querySelector<HTMLElement>('[data-tree-id="veg"]')!;
    await userEvent.click(veg);
    await expectNoViolations(container); // branch loading (aria-busy)
    await new Promise((r) => setTimeout(r, 60));
    await settle();
    expect(container.querySelector('[data-placeholder="error"]')).not.toBeNull();
    await expectNoViolations(container); // error placeholder
  });
});
