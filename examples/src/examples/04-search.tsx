import { createSignal } from "solid-js";
import { Tree, type TreeMatcher, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 4,
  title: "Search",
  description:
    "Filter with searchQuery. Prune hides non-matches (keeping their ancestors), dim keeps the whole tree and fades them. The default matcher highlights hits with <mark>; pass a custom matcher (here, a fuzzy subsequence match) for your own policy. A polite live region announces “N matches”.",
  tags: ["search", "matcher", "filterMode", "live region"],
};

const data: TreeNodeData[] = [
  {
    id: "fruit",
    label: "Fruit",
    type: "group",
    children: [
      { id: "apple", label: "Apple", type: "item" },
      { id: "banana", label: "Banana", type: "item" },
      { id: "blueberry", label: "Blueberry", type: "item" },
      { id: "mango", label: "Mango", type: "item" },
    ],
  },
  {
    id: "veg",
    label: "Vegetables",
    type: "group",
    children: [
      { id: "carrot", label: "Carrot", type: "item" },
      { id: "spinach", label: "Spinach", type: "item" },
      { id: "green-bean", label: "Green bean", type: "item" },
    ],
  },
  { id: "nuts", label: "Nuts", type: "group", children: [{ id: "almond", label: "Almond", type: "item" }] },
];

/** Fuzzy: every query character appears in the label, in order ("bnn" → Banana). */
const subsequence: TreeMatcher = (node, query) => {
  const label = node.label.toLowerCase();
  let i = 0;
  for (const ch of query.toLowerCase()) {
    i = label.indexOf(ch, i) + 1;
    if (i === 0) return false;
  }
  return true;
};

export default function Search() {
  const [query, setQuery] = createSignal("");
  const [mode, setMode] = createSignal<"prune" | "dim">("prune");
  const [matcher, setMatcher] = createSignal<"default" | "fuzzy">("default");

  return (
    <div>
      <div class="toolbar">
        <input type="search" aria-label="Search produce" placeholder="Search…" data-testid="query" onInput={(e) => setQuery(e.currentTarget.value)} />
        <label>
          Mode{" "}
          <select data-testid="mode" value={mode()} onInput={(e) => setMode(e.currentTarget.value as "prune" | "dim")}>
            <option value="prune">prune</option>
            <option value="dim">dim</option>
          </select>
        </label>
        <label>
          Matcher{" "}
          <select data-testid="matcher" value={matcher()} onInput={(e) => setMatcher(e.currentTarget.value as "default" | "fuzzy")}>
            <option value="default">substring (highlights)</option>
            <option value="fuzzy">fuzzy subsequence</option>
          </select>
        </label>
      </div>
      <Tree
        data={data}
        ariaLabel="Produce"
        searchQuery={query()}
        filterMode={mode()}
        // Highlighting only happens with the default matcher: the tree cannot know what
        // a custom matcher matched on. Use renderLabel to highlight custom hits yourself.
        matcher={matcher() === "fuzzy" ? subsequence : undefined}
        noMatchesLabel="Nothing in the pantry matches"
      />
      <p class="muted">
        Matching rows keep their ancestors visible. Screen readers hear the match count from the tree’s polite live region (role="status").
      </p>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const $ = <E extends HTMLElement>(id: string) => root.querySelector<E>(`[data-testid="${id}"]`)!;
  const live = () => root.querySelector(".solid-tree-live")!.textContent;
  const marks = () => [...root.querySelectorAll("mark")].map((m) => m.textContent);

  // Default matcher, prune mode: hits + ancestors only, highlighted.
  await h.type($("query"), "an");
  h.expect(h.has("banana")).toBe(true);
  h.expect(h.has("mango")).toBe(true);
  h.expect(h.has("apple")).toBe(false);
  h.expect(marks()).toContain("an");
  h.expect(live()).toBe("3 matches"); // Banana, Mango, Green bean

  // Dim mode: everything stays, non-matches are marked dimmed.
  await h.type($("mode"), "dim");
  h.expect(h.has("apple")).toBe(true);
  h.expect(h.row("apple").hasAttribute("data-dimmed")).toBe(true);
  h.expect(h.row("banana").hasAttribute("data-dimmed")).toBe(false);

  // Custom matcher: fuzzy hits, no built-in highlight.
  await h.type($("mode"), "prune");
  await h.type($("matcher"), "fuzzy");
  await h.type($("query"), "bby");
  h.expect(h.has("blueberry")).toBe(true);
  h.expect(h.has("banana")).toBe(false);
  h.expect(marks()).toEqual([]);
  h.expect(live()).toBe("1 match");

  // No matches → noMatchesLabel and an announcement.
  await h.type($("query"), "zzz");
  h.expect(root.querySelector(".solid-tree-empty")!.textContent).toBe("Nothing in the pantry matches");
  h.expect(live()).toBe("No matches");
};
