import { For, createSignal } from "solid-js";
import { DatabaseTree, createDatabaseTreeController, type TreeChange, type TreeNodeData } from "@timotholt/solid-tree/database";
import { createMemorySource } from "@timotholt/solid-tree/testing";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 10,
  title: "Realtime without a backend",
  description:
    "createMemorySource is a fake backend with latency, failures and a realtime stream. Every button mutates it and the tree updates from the emitted changes. A real backend implements the same TreeSource.subscribe.",
  tags: ["database", "realtime", "testing", "errors", "retry"],
};

const seed: TreeNodeData[] = [
  { id: "inbox", label: "Inbox", type: "folder", iconLeft: "📥", children: [
    { id: "inbox/1", label: "Reply to Ana", type: "task" },
    { id: "inbox/2", label: "Book flights", type: "task" },
  ] },
  { id: "projects", label: "Projects", type: "folder", iconLeft: "📁", children: [
    { id: "projects/site", label: "Website", type: "task" },
  ] },
  { id: "archive", label: "Archive", type: "folder", iconLeft: "🗄️", children: [{ id: "archive/1", label: "Taxes", type: "task" }] },
];

const summarize = (c: TreeChange) =>
  c.type === "insert" ? `insert ${c.node.id} under ${c.parentId ?? "root"}`
  : c.type === "update" ? `update ${c.node.id} → "${c.node.label}"`
  : c.type === "move" ? `move ${c.id} → ${c.parentId ?? "root"}`
  : c.type === "remove" ? `remove ${c.id}` : "reload";

export default function RealtimeWithoutABackend() {
  const memory = createMemorySource(seed, { latency: [80, 200], search: false });
  const [log, setLog] = createSignal<string[]>([]);
  const note = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 12));

  // Tap the realtime stream for the log. A real backend implements exactly this method:
  // subscribe(onChange) → call onChange({ type: "insert" | "update" | "move" | "remove", … }).
  const source = { ...memory, subscribe: (onChange: (c: TreeChange) => void) => memory.subscribe!((c) => (note(summarize(c)), onChange(c))) };
  const tree = createDatabaseTreeController({ source });

  let next = 1;
  const selected = () => tree.selectedId();
  const selectedNode = () => (selected() ? tree.index().get(selected()!) : undefined);
  const folderOf = (id: string | null) => (!id ? null : tree.index().get(id)?.type === "folder" ? id : tree.index().parentOf(id) ?? null);

  const insert = () => {
    const parent = folderOf(selected());
    memory.insert(parent, { id: `new-${next}`, label: `New task ${next++}`, type: "task" });
  };
  const rename = () => {
    const n = selectedNode();
    if (n) memory.update({ id: n.id, label: `${n.label.replace(/ \(edited\)$/, "")} (edited)` });
  };
  const remove = () => selected() && memory.remove(selected()!);
  const moveTo = (parent: string | null) => selected() && selected() !== parent && memory.moveTo(selected()!, parent);
  const failLoads = () => {
    const id = folderOf(selected()) ?? "projects";
    memory.fail(id);
    tree.expand(id);
    void tree.reloadChildren(id); // refetch now; it fails until Heal → error row
    note(`loads of ${id} now fail`);
  };
  const heal = () => {
    ["inbox", "projects", "archive"].forEach((id) => memory.heal(id));
    note("healed — click the error row to retry");
  };

  return (
    <div class="split">
      <div>
        <div class="toolbar" role="group" aria-label="Backend mutations">
          <button type="button" onClick={insert}>Insert</button>
          <button type="button" onClick={rename} disabled={!selected()}>Rename</button>
          <button type="button" onClick={remove} disabled={!selected()}>Remove</button>
          <button type="button" onClick={() => moveTo(null)} disabled={!selected()}>Move to top</button>
          <button type="button" onClick={() => moveTo("archive")} disabled={!selected()}>Move to Archive</button>
          <button type="button" onClick={failLoads}>Fail loads</button>
          <button type="button" onClick={heal}>Heal</button>
        </div>
        <DatabaseTree tree={tree} ariaLabel="Tasks" viewportStyle={{ height: "300px" }} />
      </div>
      <div class="panel">
        <p class="muted">Realtime events (newest first)</p>
        <ol data-testid="log" aria-live="polite" style={{ margin: 0, "padding-left": "18px", "font-family": "ui-monospace, monospace", "font-size": "12px" }}>
          <For each={log()} fallback={<li>Nothing yet. Select a row and press a button.</li>}>
            {(line) => <li>{line}</li>}
          </For>
        </ol>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const button = (name: string) => [...root.querySelectorAll("button")].find((b) => b.textContent === name)!;
  const level = (id: string) => h.row(id).getAttribute("aria-level");
  await h.settle(300);
  await h.click("inbox");
  await h.settle(300);
  h.expect(h.has("inbox/1")).toBe(true);

  await h.click(button("Insert")); // inbox is selected → inserted under it
  h.expect(h.has("new-1")).toBe(true);
  h.expect(level("new-1")).toBe("2");

  await h.click("new-1");
  await h.click(button("Move to top"));
  h.expect(level("new-1")).toBe("1");
  h.expect(root.querySelector('[data-testid="log"]')!.textContent).toContain("move new-1 → root");

  await h.click("inbox/2");
  await h.click(button("Rename"));
  h.expect(h.row("inbox/2").textContent).toContain("Book flights (edited)");

  await h.click(button("Fail loads")); // inbox/2 selected → its folder (inbox) reloads and fails
  await h.settle(300);
  const error = root.querySelector<HTMLElement>('[data-placeholder="error"] .solid-tree-item');
  h.expect(error).not.toBeNull();
  await h.click(button("Heal"));
  await h.click(error!); // error rows retry on click
  await h.settle(300);
  h.expect(h.has("inbox/2")).toBe(true);
};
