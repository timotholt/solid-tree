import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { createSignal, onCleanup } from "solid-js";
import { Tree } from "../../src/view/Tree.js";
import { createTreeController } from "../../src/controller/index.js";
import type { TreeNodeData, TreeRowClickPolicy } from "../../src/types.js";
import { flush } from "../support/root.js";
import { expectConsole } from "../support/console.js";
import { n, produce } from "../support/fixtures.js";

const items = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[role='treeitem']"));
const item = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-tree-id='${id}']`)!;
const visibleIds = (c: HTMLElement) => items(c).map((e) => e.dataset.treeId);
const labelOf = (el: HTMLElement) => el.querySelector(".solid-tree-label")!.textContent;

describe("<Tree> structure and ARIA", () => {
  it("renders a labelled tree with one treeitem per visible node", () => {
    const { container, getByRole } = render(() => (
      <Tree data={produce()} onSelect={() => {}} selectedId={null} ariaLabel="Produce" />
    ));
    expect(getByRole("tree").getAttribute("aria-label")).toBe("Produce");
    expect(visibleIds(container)).toEqual(["fruit", "veg"]);
  });

  it("supports aria-labelledby", () => {
    const { getByRole } = render(() => <Tree data={[]} onSelect={() => {}} ariaLabelledBy="hdr" />);
    expect(getByRole("tree").getAttribute("aria-labelledby")).toBe("hdr");
  });

  it("sets aria-level, aria-expanded (parents only) and aria-selected", () => {
    const { container } = render(() => <Tree data={produce()} onSelect={() => {}} selectedId="banana" />);
    const banana = item(container, "banana");
    expect(banana.getAttribute("aria-level")).toBe("2");
    expect(banana.getAttribute("aria-selected")).toBe("true");
    expect(banana.hasAttribute("aria-expanded")).toBe(false);
    expect(item(container, "fruit").getAttribute("aria-expanded")).toBe("true");
    expect(item(container, "veg").getAttribute("aria-expanded")).toBe("false");
  });

  it("uses a roving tabindex: exactly one row is tabbable, the selected one", () => {
    const { container } = render(() => <Tree data={produce()} onSelect={() => {}} selectedId="banana" />);
    const tabbable = items(container).filter((e) => e.tabIndex === 0);
    expect(tabbable.map((e) => e.dataset.treeId)).toEqual(["banana"]);
  });

  it("renders dividers as presentation, not treeitems", () => {
    const data = [n("a"), n("d", undefined, { isDivider: true, label: "" }), n("b")];
    const { container } = render(() => <Tree data={data} onSelect={() => {}} />);
    expect(visibleIds(container)).toEqual(["a", "b"]);
    // role "none" is the ARIA 1.1+ synonym of "presentation".
    expect(container.querySelector(".solid-tree-divider")!.getAttribute("role")).toBe("none");
  });

  it("renders count, icons and the action variant", () => {
    const data = [
      n("a", undefined, { count: 3, iconLeft: "L", iconRight: "R" }),
      n("add", undefined, { variant: "action", label: "+ Add" }),
    ];
    const { container } = render(() => <Tree data={data} onSelect={() => {}} />);
    const a = item(container, "a");
    expect(a.querySelector(".solid-tree-count")!.textContent).toBe("(3)");
    expect(a.querySelector(".solid-tree-icon-left")!.textContent).toBe("L");
    expect(a.querySelector(".solid-tree-icon-right")!.textContent).toBe("R");
    expect(item(container, "add").dataset.variant).toBe("action");
  });

  it("applies basePadding/indentStep as CSS custom properties", () => {
    const { getByRole } = render(() => <Tree data={[]} onSelect={() => {}} basePadding={5} indentStep={9} />);
    const style = getByRole("tree").style;
    expect(style.getPropertyValue("--tree-indent-base")).toBe("5px");
    expect(style.getPropertyValue("--tree-indent-step")).toBe("9px");
  });
});

describe("<Tree> mouse", () => {
  it("finder policy: click selects and expands a closed parent; clicking it again collapses", () => {
    const onSelect = vi.fn();
    const [sel, setSel] = createSignal<string | null>(null);
    const { container } = render(() => (
      <Tree data={produce()} selectedId={sel()} onSelect={(node) => (onSelect(node.id), setSel(node.id))} />
    ));
    fireEvent.click(item(container, "veg"));
    expect(onSelect).toHaveBeenLastCalledWith("veg");
    expect(visibleIds(container)).toContain("carrot");
    fireEvent.click(item(container, "veg"));
    expect(visibleIds(container)).not.toContain("carrot");
  });

  it("finder policy: clicking an expanded, unselected parent selects without collapsing", () => {
    const { container } = render(() => <Tree data={produce()} onSelect={() => {}} selectedId={null} />);
    fireEvent.click(item(container, "fruit")); // starts collapsed → expands (and selects, uncontrolled ignored)
    fireEvent.click(item(container, "fruit"));
    expect(visibleIds(container)).toContain("apple");
  });

  it("select-only policy never toggles from the row body", () => {
    const { container } = render(() => (
      <Tree data={produce()} onSelect={() => {}} selectedId={null} rowClickPolicy="select-only" />
    ));
    fireEvent.click(item(container, "veg"));
    expect(visibleIds(container)).not.toContain("carrot");
  });

  it("the chevron toggles without selecting", () => {
    const onSelect = vi.fn();
    const { container } = render(() => <Tree data={produce()} onSelect={onSelect} selectedId={null} />);
    fireEvent.click(item(container, "veg").querySelector(".solid-tree-chevron")!);
    expect(visibleIds(container)).toContain("carrot");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicks inside renderActionNode do not select the row", () => {
    const onSelect = vi.fn();
    const { container } = render(() => (
      <Tree data={produce()} onSelect={onSelect} renderActionNode={() => <button class="act">x</button>} />
    ));
    fireEvent.click(item(container, "veg").querySelector(".act")!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renderLabel replaces the label", () => {
    const { container } = render(() => (
      <Tree data={produce()} onSelect={() => {}} renderLabel={(node) => <b>{node.id.toUpperCase()}</b>} />
    ));
    expect(labelOf(item(container, "veg"))).toBe("VEG");
  });
});

describe("<Tree> keyboard", () => {
  it("ArrowDown moves focus; Enter selects; ArrowRight expands", async () => {
    const onSelect = vi.fn();
    const { container } = render(() => <Tree data={produce()} onSelect={onSelect} selectedId={null} />);
    item(container, "fruit").focus();
    fireEvent.keyDown(item(container, "fruit"), { key: "ArrowDown" });
    await flush();
    expect(document.activeElement).toBe(item(container, "veg"));
    fireEvent.keyDown(item(container, "veg"), { key: "ArrowRight" });
    expect(visibleIds(container)).toContain("carrot");
    fireEvent.keyDown(item(container, "veg"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "veg" }));
  });

  it("keys inside the action slot are ignored by tree navigation", () => {
    const onSelect = vi.fn();
    const { container } = render(() => (
      <Tree data={produce()} onSelect={onSelect} renderActionNode={() => <button class="act">x</button>} />
    ));
    fireEvent.keyDown(item(container, "veg").querySelector(".act")!, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("<Tree> search", () => {
  it("highlights the matched substring with <mark>", () => {
    const { container } = render(() => <Tree data={produce()} onSelect={() => {}} searchQuery="nan" />);
    expect(item(container, "banana").querySelector("mark")!.textContent).toBe("nan");
  });

  it("shows the no-matches label and marks the container as searching", () => {
    const { getByRole, getByText } = render(() => (
      <Tree data={produce()} onSelect={() => {}} searchQuery="kiwi" noMatchesLabel="Nothing" />
    ));
    expect(getByText("Nothing")).toBeTruthy();
    expect(getByRole("tree").hasAttribute("data-searching")).toBe(true);
  });

  it("dim mode marks non-matches with data-dimmed", () => {
    const { container } = render(() => (
      <Tree data={produce()} onSelect={() => {}} searchQuery="carrot" filterMode="dim" />
    ));
    expect(item(container, "fruit").hasAttribute("data-dimmed")).toBe(true);
    expect(item(container, "carrot").hasAttribute("data-dimmed")).toBe(false);
  });
});

describe("<Tree> with an external controller", () => {
  it("renders from the controller and reflects imperative actions", () => {
    let api!: ReturnType<typeof createTreeController>;
    const { container } = render(() => {
      api = createTreeController({ data: () => produce() });
      return <Tree tree={api} />;
    });
    api.expand("veg");
    api.select("carrot");
    expect(item(container, "carrot").getAttribute("aria-selected")).toBe("true");
  });
});

// ── Known defects ────────────────────────────────────────────────────────────────

it("regression(A1): <Tree> without selectedId shows the clicked row as selected", () => {
  const { container } = render(() => <Tree data={produce()} onSelect={() => {}} />);
  fireEvent.click(item(container, "veg"));
  expect(item(container, "veg").getAttribute("aria-selected")).toBe("true");
});

it("regression(G1): changing rowClickPolicy at runtime takes effect", () => {
  const [policy, setPolicy] = createSignal<TreeRowClickPolicy>("finder");
  const { container } = render(() => <Tree data={produce()} onSelect={() => {}} rowClickPolicy={policy()} />);
  setPolicy("select-only");
  fireEvent.click(item(container, "veg"));
  expect(visibleIds(container)).not.toContain("carrot");
});

it("regression(G1): changing the matcher prop at runtime takes effect", () => {
  const byLabel = (node: TreeNodeData, q: string) => node.label.includes(q);
  const onlyBlue = (node: TreeNodeData) => node.id === "blue";
  const [m, setM] = createSignal<(node: TreeNodeData, q: string) => boolean>(byLabel);
  const { container } = render(() => <Tree data={produce()} onSelect={() => {}} searchQuery="carrot" matcher={m()} />);
  expect(visibleIds(container)).toContain("carrot");
  setM(() => onlyBlue);
  expect(visibleIds(container)).toContain("blue");
});

it("regression(G2): rows are not remounted on every search keystroke", () => {
  let mounts = 0;
  const [q, setQ] = createSignal("b");
  render(() => (
    <Tree
      data={produce()}
      onSelect={() => {}}
      searchQuery={q()}
      renderLabel={(node) => {
        mounts++;
        onCleanup(() => {});
        return <span>{node.label}</span>;
      }}
    />
  ));
  const before = mounts;
  setQ("bl");
  setQ("blu");
  expect(mounts - before).toBe(0);
});

it("regression(E1): treeitems expose aria-setsize and aria-posinset", () => {
  const { container } = render(() => <Tree data={produce()} onSelect={() => {}} />);
  const veg = item(container, "veg");
  expect(veg.getAttribute("aria-posinset")).toBe("2");
  expect(veg.getAttribute("aria-setsize")).toBe("2");
});

describe("<Tree> keyboard extras (E3)", () => {
  it("type-ahead focuses the next row starting with the typed character", async () => {
    const { container } = render(() => <Tree data={produce()} onSelect={() => {}} />);
    item(container, "fruit").focus();
    fireEvent.keyDown(item(container, "fruit"), { key: "v" });
    await flush();
    expect(document.activeElement).toBe(item(container, "veg"));
  });

  it("* expands all sibling parents", () => {
    const { container } = render(() => <Tree data={produce()} onSelect={() => {}} />);
    fireEvent.keyDown(item(container, "fruit"), { key: "*" });
    expect(visibleIds(container)).toEqual(expect.arrayContaining(["apple", "carrot"]));
  });

  it("Enter activates; Space only selects", () => {
    const onActivate = vi.fn();
    const { container } = render(() => <Tree data={produce()} onSelect={() => {}} onActivate={onActivate} />);
    fireEvent.keyDown(item(container, "veg"), { key: " " });
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.keyDown(item(container, "veg"), { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "veg" }));
  });
});

describe("<Tree> dev warnings (D5)", () => {
  it("warns when tree={...} is combined with data or controller props", () => {
    render(() => {
      const t = createTreeController({ data: () => produce() });
      return <Tree tree={t} data={produce()} selectedId="veg" />;
    });
    expect(expectConsole("warn", /ignores these props.*data, selectedId/)).toBe(1);
  });
});
