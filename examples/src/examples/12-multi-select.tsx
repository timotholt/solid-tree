import { createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 12,
  title: "Multi-select + bulk actions",
  description:
    'selectionMode="multiple" with a controlled selectedIds: Shift-click or Shift+Arrow extends a range, Ctrl/Cmd-click toggles one row, Ctrl/Cmd+A selects everything. The toolbar acts on the selection and deletes from the app\'s own data.',
  tags: ["multi-select", "controlled", "keyboard"],
};

const initial: TreeNodeData[] = [
  { id: "beach.jpg", label: "beach.jpg", type: "photo", iconLeft: "🏖️" },
  { id: "city.jpg", label: "city.jpg", type: "photo", iconLeft: "🌆" },
  { id: "forest.jpg", label: "forest.jpg", type: "photo", iconLeft: "🌲" },
  { id: "mountain.jpg", label: "mountain.jpg", type: "photo", iconLeft: "🏔️" },
  { id: "sunset.jpg", label: "sunset.jpg", type: "photo", iconLeft: "🌅" },
  { id: "snow.jpg", label: "snow.jpg", type: "photo", iconLeft: "❄️" },
];

export default function MultiSelect() {
  const [photos, setPhotos] = createSignal(initial);
  const [selected, setSelected] = createSignal<string[]>([]);

  const deleteSelected = () => {
    const gone = new Set(selected());
    setPhotos((list) => list.filter((p) => !gone.has(p.id)));
    setSelected([]);
  };

  return (
    <div class="split">
      <div>
        <div class="toolbar">
          <span data-testid="count" aria-live="polite">
            {selected().length} selected
          </span>
          <button type="button" onClick={() => setSelected(photos().map((p) => p.id))}>
            Select all
          </button>
          <button type="button" onClick={() => setSelected([])} disabled={!selected().length}>
            Clear
          </button>
          <button type="button" onClick={deleteSelected} disabled={!selected().length}>
            Delete selected
          </button>
        </div>
        {/* `selectedIds` passed ⇒ the app owns the selection; the tree reports changes. */}
        <Tree
          data={photos()}
          ariaLabel="Photos"
          selectionMode="multiple"
          selectedIds={selected()}
          onSelectionChange={setSelected}
        />
      </div>
      <div class="panel">
        <p class="muted">Try it</p>
        <ul>
          <li>Click a photo, then Shift-click another to select the range.</li>
          <li>Ctrl-click (Cmd-click on macOS) adds or removes one photo.</li>
          <li>Shift+↓ / Shift+↑ extends the selection from the keyboard.</li>
          <li>Ctrl/Cmd+A selects every visible row.</li>
        </ul>
        <p>
          selectedIds: <code data-testid="ids">{selected().join(", ") || "none"}</code>
        </p>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const count = () => root.querySelector('[data-testid="count"]')!.textContent;
  const button = (name: string) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim() === name)!;

  await h.click("beach.jpg");
  await h.click("mountain.jpg", { shiftKey: true }); // range: beach → mountain
  h.expect(count()).toBe("4 selected");
  h.expect(h.row("forest.jpg").getAttribute("aria-selected")).toBe("true");

  await h.click("city.jpg", { ctrlKey: true }); // toggle one out
  h.expect(count()).toBe("3 selected");
  h.expect(h.row("city.jpg").getAttribute("aria-selected")).toBe("false");

  await h.click(button("Delete selected"));
  for (const id of ["beach.jpg", "forest.jpg", "mountain.jpg"]) h.expect(h.has(id)).toBe(false);
  h.expect(h.has("city.jpg")).toBe(true);
  h.expect(count()).toBe("0 selected");

  await h.click(button("Select all"));
  h.expect(count()).toBe("3 selected");
  await h.click(button("Clear"));
  h.expect(count()).toBe("0 selected");
  await h.key("city.jpg", "a", { ctrlKey: true }); // Ctrl+A from the keyboard
  h.expect(count()).toBe("3 selected");
  h.expect(h.row("snow.jpg").getAttribute("aria-selected")).toBe("true");
};
