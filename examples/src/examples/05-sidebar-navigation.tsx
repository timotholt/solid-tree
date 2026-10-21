import { createMemo, createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 5,
  title: "Sidebar navigation",
  description:
    "An app sidebar: groups, separators, unread counts, an “+ New project” action row and a hover delete button. rowClickPolicy=\"select-only\" keeps groups open when you click them. The delete button is a pointer shortcut, so the Delete key does the same from the keyboard.",
  tags: ["sidebar", "separators", "count", "renderActionNode", "rowClickPolicy", "variant"],
};

const NEW = "new-project";

export default function SidebarNavigation() {
  const [projects, setProjects] = createSignal([
    { id: "p-website", label: "Website", count: 4 },
    { id: "p-mobile", label: "Mobile app", count: 0 },
  ]);
  const [selected, setSelected] = createSignal<string | null>("inbox");
  // There is no "default expanded" option, so the sidebar controls its expansion.
  const [expanded, setExpanded] = createSignal<string[]>(["views", "projects"]);
  let next = 1;

  const data = createMemo<TreeNodeData[]>(() => [
    {
      id: "views",
      label: "Views",
      type: "group",
      children: [
        { id: "inbox", label: "Inbox", type: "view", iconLeft: "📥 ", count: 12 },
        { id: "today", label: "Today", type: "view", iconLeft: "📅 ", count: 3 },
        { id: "upcoming", label: "Upcoming", type: "view", iconLeft: "🗓️ " },
      ],
    },
    { id: "sep-1", label: "", type: "separator", kind: "separator" },
    {
      id: "projects",
      label: "Projects",
      type: "group",
      children: [
        ...projects().map((p) => ({ id: p.id, label: p.label, type: "project", iconLeft: "📁 ", count: p.count })),
        { id: NEW, label: "+ New project", type: "action", variant: "action" as const },
      ],
    },
    { id: "sep-2", label: "", type: "separator", isDivider: true },
    { id: "settings", label: "Settings", type: "view", iconLeft: "⚙️ " },
  ]);

  const addProject = () => {
    const id = `p-new-${next}`;
    setProjects((ps) => [...ps, { id, label: `Untitled ${next++}`, count: 0 }]);
    setSelected(id); // the action row itself never stays selected
  };
  const removeProject = (id: string) => {
    setProjects((ps) => ps.filter((p) => p.id !== id));
    if (selected() === id) setSelected("inbox");
  };
  const title = () => data().flatMap((n) => [n, ...(n.children ?? [])]).find((n) => n.id === selected())?.label ?? "";

  return (
    <div class="split">
      {/* Keyboard equivalent of the (aria-hidden) delete button: Delete on a focused project. */}
      <div
        onKeyDown={(e) => {
          const id = (e.target as HTMLElement).closest<HTMLElement>("[data-tree-id]")?.dataset.treeId;
          if (e.key === "Delete" && id?.startsWith("p-")) removeProject(id);
        }}
      >
        <Tree
          data={data()}
          ariaLabel="Workspace"
          rowClickPolicy="select-only"
          selectedId={selected()}
          expandedIds={expanded()}
          onExpandedChange={setExpanded}
          onSelect={(n) => (n.id === NEW ? addProject() : n.type !== "group" && setSelected(n.id))}
          renderActionNode={(n) =>
            n.type === "project" ? (
              <button type="button" aria-label={`Delete ${n.label}`} title="Delete (or press Delete)" onClick={() => removeProject(n.id)}>
                ×
              </button>
            ) : null
          }
        />
      </div>
      <div class="panel">
        <p class="muted">Current page</p>
        <p style={{ "font-size": "20px", "font-weight": 700, margin: 0 }} data-testid="page">
          {title()}
        </p>
        <p class="muted">Projects: {projects().length}. Focus a project and press Delete to remove it.</p>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const page = () => root.querySelector('[data-testid="page"]')!.textContent;
  h.expect(page()).toBe("Inbox");
  await h.click("today");
  h.expect(page()).toBe("Today");

  // select-only: clicking a group does not collapse it (only chevron/keyboard toggle).
  await h.click("projects");
  h.expect(h.has("p-website")).toBe(true);
  await h.key("projects", "ArrowLeft");
  h.expect(h.has("p-website")).toBe(false);
  await h.key("projects", "ArrowRight");
  h.expect(h.has("p-website")).toBe(true);

  // Separators are not treeitems (not focusable, not counted in aria-setsize).
  h.expect(root.querySelectorAll('[role="treeitem"][data-tree-id^="sep-"]').length).toBe(0);
  h.expect(h.row("views").getAttribute("aria-setsize")).toBe("3");

  // The action row: click (or Enter) creates a project and selects it.
  await h.click(NEW);
  h.expect(h.has("p-new-1")).toBe(true);
  h.expect(page()).toBe("Untitled 1");
  await h.key(NEW, "Enter");
  h.expect(h.has("p-new-2")).toBe(true);

  // Pointer shortcut and its keyboard equivalent.
  const del = h.row("p-mobile").querySelector<HTMLElement>(".solid-tree-action button")!;
  await h.click(del);
  h.expect(h.has("p-mobile")).toBe(false);
  await h.key("p-website", "Delete");
  h.expect(h.has("p-website")).toBe(false);
};
