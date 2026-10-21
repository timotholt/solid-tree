import { For, Show, createSignal } from "solid-js";
import { DatabaseTree, createDatabaseTreeController, type TreeNodeData, type TreeSource } from "@timotholt/solid-tree/database";
import type { ExampleBefore, ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 9,
  title: "Lazy REST (GitHub)",
  description:
    "A <DatabaseTree> over the GitHub contents API: a TreeSource is just getRoots + getChildren. Folders load on expand; a failed load (e.g. the 60/hour rate limit) becomes an error row you can retry.",
  tags: ["database", "TreeSource", "lazy loading", "errors", "retry"],
};

interface GhEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
}

const toNode = (e: GhEntry): TreeNodeData => ({
  id: e.path,
  label: e.name,
  type: e.type,
  iconLeft: e.type === "dir" ? "📁" : "📄",
  payload: { leaf: e.type === "file", path: e.path },
});

// Folders first, then by name — used for the initial lists and for realtime placement.
const compare = (a: TreeNodeData, b: TreeNodeData) => (a.type === b.type ? a.label.localeCompare(b.label) : a.type === "dir" ? -1 : 1);

function githubSource(repo: string): TreeSource {
  const list = async (path: string) => {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    // Throw: the tree turns a rejected load into an error placeholder row with retry.
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      throw new Error(`GitHub rate limit reached (60 requests/hour unauthenticated)${reset ? `; resets at ${new Date(reset).toLocaleTimeString()}` : ""}`);
    }
    if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status} for "${path || "/"}"`);
    const body = (await res.json()) as GhEntry[];
    return Array.isArray(body) ? body.map(toNode).sort(compare) : [];
  };
  return { getRoots: () => list(""), getChildren: (node) => list(node.payload.path), compare };
}

function RepoTree(props: { repo: string }) {
  const tree = createDatabaseTreeController({ source: githubSource(props.repo) });
  // Every branch currently in the error state (null = the roots).
  const failures = () =>
    [null, ...tree.index().order]
      .filter((id) => tree.error(id))
      .map((id) => ({ id, message: String((tree.error(id) as Error)?.message ?? tree.error(id)) }));
  return (
    <div class="split">
      <DatabaseTree tree={tree} ariaLabel={`Files in ${props.repo}`} viewportStyle={{ height: "320px" }} />
      <div class="panel" aria-live="polite">
        <p class="muted">Load errors</p>
        <Show when={failures().length} fallback={<p>None. Expand a folder to fetch it.</p>}>
          <For each={failures()}>
            {(f) => (
              <p data-testid="failure">
                {f.id ?? "repository root"}: {f.message}{" "}
                <button type="button" onClick={() => void tree.retry(f.id)}>
                  Retry {f.id ?? "root"}
                </button>
              </p>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

export default function LazyRest() {
  const [repo, setRepo] = createSignal("solidjs/solid");
  const [draft, setDraft] = createSignal(repo());
  return (
    <div>
      <form
        class="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setRepo(draft().trim());
        }}
      >
        <label>
          Repository{" "}
          <input value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} placeholder="owner/repo" />
        </label>
        <button type="submit">Load</button>
      </form>
      {/* keyed: a new repo remounts the tree with a fresh source and cache */}
      <Show when={repo()} keyed>
        {(r) => <RepoTree repo={r} />}
      </Show>
    </div>
  );
}

// ── test fixture: a tiny fake repo; "docs" fails once with a rate-limit response ──
const fake: Record<string, [string, "dir" | "file"][]> = {
  "": [["README.md", "file"], ["src", "dir"], ["docs", "dir"], ["package.json", "file"]],
  src: [["index.ts", "file"], ["core", "dir"]],
  "src/core": [["tree.ts", "file"]],
  docs: [["guide.md", "file"]],
};
let docsFailures = 0;

export const before: ExampleBefore = (h) => {
  docsFailures = 1;
  h.mockFetch((url) => {
    const path = decodeURIComponent(url.split("/contents/")[1] ?? "");
    if (path === "docs" && docsFailures-- > 0)
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" },
      });
    return (fake[path] ?? []).map(([name, type]) => ({ name, type, size: 1, path: path ? `${path}/${name}` : name }));
  });
};

export const check: ExampleCheck = async (root, h) => {
  await h.settle(20);
  const ids = () => [...root.querySelectorAll("[data-tree-id]")].map((el) => el.getAttribute("data-tree-id"));
  h.expect(ids().slice(0, 4)).toEqual(["docs", "src", "package.json", "README.md"]); // folders first
  await h.click("src");
  await h.settle(20);
  h.expect(h.has("src/index.ts")).toBe(true);
  h.expect(h.has("src/core")).toBe(true);

  await h.click("docs");
  await h.settle(20);
  const error = root.querySelector<HTMLElement>('[data-placeholder="error"]');
  h.expect(error).not.toBeNull();
  h.expect(root.querySelector('[data-testid="failure"]')!.textContent).toContain("rate limit");
  await h.click(error!.querySelector<HTMLElement>(".solid-tree-item") ?? error!); // error rows retry on click
  await h.settle(20);
  h.expect(root.querySelector('[data-placeholder="error"]')).toBeNull();
  h.expect(h.has("docs/guide.md")).toBe(true);
};
