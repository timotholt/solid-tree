import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { For, createSignal } from "solid-js";
import { Tree } from "../../src/view/Tree.js";
import { createTreeController } from "../../src/controller/index.js";
import { createTreeView } from "../../src/view/headless/createTreeView.js";
import { flush } from "../support/root.js";
import { produce } from "../support/fixtures.js";

const item = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-tree-id='${id}']`)!;

describe("view behavior (phase 4)", () => {
  it("double-click activates (E3)", () => {
    const onActivate = vi.fn();
    const { container } = render(() => <Tree data={produce()} onActivate={onActivate} />);
    fireEvent.dblClick(item(container, "veg"));
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "veg" }));
  });

  it("a disabled node is focusable but cannot be selected or activated", () => {
    const onSelect = vi.fn();
    const onActivate = vi.fn();
    const data = [{ id: "a", label: "A", type: "t", disabled: true }];
    const { container } = render(() => <Tree data={data} onSelect={onSelect} onActivate={onActivate} />);
    fireEvent.click(item(container, "a"));
    fireEvent.dblClick(item(container, "a"));
    fireEvent.keyDown(item(container, "a"), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
    expect(item(container, "a").getAttribute("aria-disabled")).toBe("true");
    expect(item(container, "a").tabIndex).toBe(0);
  });

  it("Ctrl/Cmd-click toggles and Shift-click extends in multiple mode", () => {
    const { container } = render(() => <Tree data={produce()} selectionMode="multiple" expandedIds={["fruit"]} />);
    fireEvent.click(item(container, "apple"));
    fireEvent.click(item(container, "berries"), { shiftKey: true });
    expect(container.querySelectorAll("[aria-selected='true']").length).toBe(3);
    fireEvent.click(item(container, "banana"), { metaKey: true });
    expect(item(container, "banana").getAttribute("aria-selected")).toBe("false");
    expect(container.querySelector("[role=tree]")!.getAttribute("aria-multiselectable")).toBe("true");
  });

  it("Ctrl+A selects all visible rows in multiple mode; Shift+ArrowDown extends", async () => {
    const { container } = render(() => <Tree data={produce()} selectionMode="multiple" />);
    fireEvent.click(item(container, "fruit")); // selects + expands
    fireEvent.keyDown(item(container, "fruit"), { key: "ArrowDown", shiftKey: true });
    await flush();
    expect(container.querySelectorAll("[aria-selected='true']").length).toBe(2);
    fireEvent.keyDown(item(container, "fruit"), { key: "a", ctrlKey: true });
    expect(container.querySelectorAll("[aria-selected='true']").length).toBe(5);
  });

  it("announces search results in a polite live region (E2)", () => {
    const [q, setQ] = createSignal("");
    const { container } = render(() => <Tree data={produce()} searchQuery={q()} />);
    const live = () => container.querySelector("[role=status]")!;
    expect(live().textContent).toBe("");
    setQ("b"); // Banana, Berries, Blue, Vegetables
    expect(live().textContent).toBe("4 matches");
    setQ("kiwi");
    expect(live().textContent).toBe("No matches");
    expect(live().getAttribute("aria-live")).toBe("polite");
  });

  it("the actions slot is hidden from assistive tech and out of the tab order (G6)", async () => {
    const { container } = render(() => <Tree data={produce()} renderActionNode={() => <button class="act">x</button>} />);
    await flush();
    const slot = item(container, "veg").querySelector(".solid-tree-action")!;
    expect(slot.getAttribute("aria-hidden")).toBe("true");
    expect(slot.querySelector("button")!.getAttribute("tabindex")).toBe("-1");
  });

  it("dir=rtl swaps arrow keys and sets dir on the tree", () => {
    const { container } = render(() => <Tree data={produce()} dir="rtl" />);
    expect(container.querySelector("[role=tree]")!.getAttribute("dir")).toBe("rtl");
    fireEvent.keyDown(item(container, "veg"), { key: "ArrowLeft" });
    expect(item(container, "veg").getAttribute("aria-expanded")).toBe("true");
  });

  it("renderLeading renders before the icon with the row", () => {
    const { container } = render(() => <Tree data={produce()} renderLeading={(row) => <i class="lead">{row.level}</i>} />);
    expect(item(container, "veg").querySelector(".lead")!.textContent).toBe("1");
  });

  it("scrollToId reveals the node and scrolls it into view", () => {
    let t!: ReturnType<typeof createTreeController>;
    const scrolled: string[] = [];
    const proto = HTMLElement.prototype as unknown as { scrollIntoView?: () => void };
    const original = proto.scrollIntoView;
    proto.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.dataset.treeId!);
    };
    const { container } = render(() => {
      t = createTreeController({ data: () => produce() });
      return <Tree tree={t} />;
    });
    t.scrollToId("blue");
    expect(item(container, "blue")).not.toBeNull();
    expect(scrolled).toEqual(["blue"]);
    proto.scrollIntoView = original;
  });
});

describe("headless createTreeView", () => {
  it("renders a fully custom tree from prop getters", async () => {
    const onActivate = vi.fn();
    const { container } = render(() => {
      let el: HTMLUListElement | undefined;
      const tree = createTreeController({ data: () => produce(), onActivate });
      const view = createTreeView({ tree, getContainer: () => el, ariaLabel: () => "Custom" });
      return (
        <ul ref={el} {...view.getRootProps<HTMLUListElement>()}>
          <For each={tree.flatRows()}>
            {(row) => (
              <li {...view.getItemProps<HTMLLIElement>(() => row)}>
                {row.hasChildren ? <span {...view.getToggleProps(() => row)}>{row.expanded ? "−" : "+"}</span> : null}
                {row.node.label}
              </li>
            )}
          </For>
        </ul>
      );
    });
    const root = container.querySelector("ul")!;
    expect(root.getAttribute("role")).toBe("tree");
    expect(root.getAttribute("aria-label")).toBe("Custom");
    const veg = item(container, "veg");
    expect(veg.tagName).toBe("LI");
    expect(veg.getAttribute("aria-level")).toBe("1");
    expect(veg.getAttribute("aria-posinset")).toBe("2");
    fireEvent.keyDown(veg, { key: "ArrowRight" });
    await flush();
    expect(item(container, "carrot")).not.toBeNull();
    fireEvent.keyDown(item(container, "veg"), { key: "Enter" });
    expect(onActivate).toHaveBeenCalled();
  });
});
