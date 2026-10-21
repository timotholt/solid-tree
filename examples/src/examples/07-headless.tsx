import { For, Show, createMemo } from "solid-js";
import { createTreeController, createTreeView, type TreeNodeData } from "@timotholt/solid-tree/headless";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 7,
  title: "Headless",
  description:
    "Your markup, the library's behavior. createTreeController owns state; createTreeView hands you ARIA, roving focus, keyboard and pointer handling as prop getters to spread onto a plain <ul>/<li>. No theme.css or <Tree> involved.",
  tags: ["headless", "createTreeView", "custom markup", "accessibility"],
};

const data: TreeNodeData[] = [
  {
    id: "planets",
    label: "Planets",
    type: "group",
    children: [
      { id: "mercury", label: "Mercury", type: "planet" },
      { id: "earth", label: "Earth", type: "planet", children: [{ id: "moon", label: "Moon", type: "moon" }] },
      { id: "mars", label: "Mars", type: "planet", children: [{ id: "phobos", label: "Phobos", type: "moon" }, { id: "deimos", label: "Deimos", type: "moon" }] },
    ],
  },
  { id: "dwarfs", label: "Dwarf planets", type: "group", children: [{ id: "pluto", label: "Pluto", type: "dwarf" }] },
];

const css = `
.hl-tree { list-style: none; margin: 0; padding: 4px; border: 1px solid #c9ced6; border-radius: 8px; font: 14px/1.4 system-ui, sans-serif; background: #fff; color: #1f2430; max-width: 320px; }
.hl-tree li { display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; cursor: pointer; }
.hl-tree li:hover { background: #eef1f5; }
.hl-tree li[data-selected] { background: #1d4ed8; color: #fff; }
.hl-tree li:focus { outline: none; }
.hl-tree li:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 1px; }
.hl-tree .hl-toggle { width: 1em; text-align: center; }
.hl-tree .hl-kind { margin-left: auto; font-size: 12px; font-style: italic; }
`;

export default function Headless() {
  let el: HTMLUListElement | undefined;
  const tree = createTreeController({ data, onSelect: (n) => console.info("selected", n.id) });
  const view = createTreeView({ tree, getContainer: () => el, ariaLabel: () => "Solar system" });

  // flatRows() is rebuilt on every change, so key the list by id (like <Tree> does) and
  // read each row through an accessor — rows keep their DOM (and focus) across updates.
  const ids = createMemo(() => tree.flatRows().map((r) => r.id));
  const byId = createMemo(() => new Map(tree.flatRows().map((r) => [r.id, r])));

  return (
    <div>
      <style>{css}</style>
      <ul ref={el} class="hl-tree" {...view.getRootProps<HTMLUListElement>()}>
        <For each={ids()}>
          {(id) => {
            const row = () => byId().get(id)!;
            return (
              <Show when={byId().has(id)}>
                <li {...view.getItemProps<HTMLLIElement>(row)} style={{ "padding-left": `${8 + row().depth * 18}px` }}>
                  <span class="hl-toggle" {...view.getToggleProps<HTMLSpanElement>(row)}>
                    {row().hasChildren ? (row().expanded ? "▾" : "▸") : ""}
                  </span>
                  <span>{row().node.label}</span>
                  <span class="hl-kind">{row().node.type}</span>
                </li>
              </Show>
            );
          }}
        </For>
      </ul>
      <div {...view.getLiveRegionProps<HTMLDivElement>()}>{view.liveMessage()}</div>
      <p class="muted">
        Selected: <code data-testid="selected">{tree.selectedId() ?? "none"}</code>
      </p>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const ul = root.querySelector("ul")!;
  h.expect(ul.getAttribute("role")).toBe("tree");
  h.expect(ul.getAttribute("aria-label")).toBe("Solar system");
  h.expect(h.row("planets").tagName).toBe("LI");
  h.expect(h.row("planets").getAttribute("aria-expanded")).toBe("false");

  // Roving tabindex: exactly one Tab stop.
  h.expect(root.querySelectorAll('li[tabindex="0"]').length).toBe(1);

  // Keyboard comes for free from the prop getters.
  await h.key("planets", "ArrowRight");
  h.expect(h.has("earth")).toBe(true);
  await h.key("planets", "ArrowDown");
  h.expect(root.ownerDocument.activeElement).toBe(h.row("mercury"));
  h.expect(h.row("mercury").getAttribute("aria-level")).toBe("2");
  h.expect(h.row("earth").getAttribute("aria-posinset")).toBe("2");

  // The toggle expands without selecting.
  await h.click(h.row("mars").querySelector<HTMLElement>(".hl-toggle")!);
  h.expect(h.has("phobos")).toBe(true);
  h.expect(h.row("mars").getAttribute("aria-selected")).toBe("false");

  // Click selects; depth drives the indentation.
  await h.click("phobos");
  h.expect(root.querySelector('[data-testid="selected"]')!.textContent).toBe("phobos");
  h.expect(h.row("phobos").hasAttribute("data-selected")).toBe(true);
  h.expect(h.row("phobos").style.paddingLeft).toBe("44px");
};
