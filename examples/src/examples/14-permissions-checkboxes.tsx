import { For, createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import type { CheckMode } from "@timotholt/solid-tree/headless";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 14,
  title: "Permissions checkboxes",
  description:
    "A role editor built on checkable rows with a controlled checkedIds. Cascade mode checks a whole group and shows a partly granted group as mixed; strict mode makes every node independent. Space toggles the focused row; disabled permissions cannot be changed.",
  tags: ["checkboxes", "controlled", "aria-checked", "keyboard"],
};

const permissions: TreeNodeData[] = [
  {
    id: "content",
    label: "Content",
    type: "group",
    children: [
      { id: "content.read", label: "Read articles", type: "perm" },
      { id: "content.write", label: "Write articles", type: "perm" },
      { id: "content.publish", label: "Publish articles", type: "perm" },
    ],
  },
  {
    id: "users",
    label: "Users",
    type: "group",
    children: [
      { id: "users.invite", label: "Invite users", type: "perm" },
      { id: "users.remove", label: "Remove users", type: "perm" },
      { id: "users.impersonate", label: "Impersonate users (owner only)", type: "perm", disabled: true },
    ],
  },
];

export default function PermissionsCheckboxes() {
  const [mode, setMode] = createSignal<CheckMode>("cascade");
  const [checked, setChecked] = createSignal<string[]>(["content.read"]);
  const [expanded, setExpanded] = createSignal<string[]>(["content", "users"]);
  const granted = () => checked().filter((id) => id.includes(".")).sort(); // leaf permissions only

  return (
    <div class="split">
      <div>
        <fieldset class="toolbar">
          <legend class="muted">Check mode</legend>
          <For each={["cascade", "strict"] as const}>
            {(m) => (
              <label>
                <input type="radio" name="check-mode" value={m} checked={mode() === m} onChange={() => setMode(m)} /> {m}
              </label>
            )}
          </For>
        </fieldset>
        <Tree
          data={permissions}
          ariaLabel="Editor role permissions"
          checkable
          checkMode={mode()}
          checkedIds={checked()}
          onCheckedChange={setChecked}
          expandedIds={expanded()}
          onExpandedChange={setExpanded}
        />
      </div>
      <div class="panel">
        <p class="muted">
          Click a box or press Space on a row. In cascade mode a group shows ▣ (aria-checked="mixed") when only some of its
          permissions are granted.
        </p>
        <p>Granted permissions:</p>
        <ul data-testid="granted">
          <For each={granted()} fallback={<li>none</li>}>
            {(id) => <li>{id}</li>}
          </For>
        </ul>
      </div>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const state = (id: string) => h.row(id).getAttribute("aria-checked");
  const granted = () => Array.from(root.querySelectorAll('[data-testid="granted"] li')).map((li) => li.textContent);

  // Cascade: checking the group checks every child.
  await h.key("content", " ");
  for (const id of ["content", "content.read", "content.write", "content.publish"]) h.expect(state(id)).toBe("true");

  // Unchecking one child makes the group mixed.
  await h.key("content.write", " ");
  h.expect(state("content")).toBe("mixed");
  h.expect(granted()).toEqual(["content.publish", "content.read"]);

  // The disabled permission is not checkable.
  h.expect(state("users.impersonate")).toBeNull();
  h.expect(h.row("users.impersonate").getAttribute("aria-disabled")).toBe("true");

  // Strict: every node is independent.
  root.querySelector<HTMLInputElement>('input[value="strict"]')!.click();
  await h.settle();
  h.expect(state("content")).toBe("false");
  await h.key("content", " ");
  h.expect(state("content")).toBe("true");
  h.expect(state("content.write")).toBe("false");
  await h.key("content.read", " ");
  h.expect(state("content.read")).toBe("false");
  h.expect(state("content")).toBe("true");
};
