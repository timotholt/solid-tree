// GitHub repo browser (?github) — a DIFFERENT <DatabaseTree>: the TreeSource is the
// REAL GitHub REST API, not a faked delay. getRoots = repo root; getChildren = a folder's
// contents, lazily on expand (real network latency, real hierarchy). Proves DatabaseTree
// works over ANY async source. Public repos, no auth (~60 requests/hr unauthenticated).
import { createSignal, type Component, type JSX } from "solid-js";
import { Show } from "solid-js";
import { DatabaseTree } from "@timotholt/solid-tree/database";
import type { TreeSource, TreeNodeData } from "@timotholt/solid-tree/database";
import "@timotholt/solid-tree/theme.css";

interface GhEntry { name: string; type: "dir" | "file"; size: number; path: string }

const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

const toNode = (e: GhEntry): TreeNodeData => ({
  id: e.path,
  label: e.name,
  type: e.type,
  iconLeft: e.type === "dir" ? "📁" : "📄",
  payload: { leaf: e.type === "file", path: e.path, size: e.size },
});

// dirs first, then alpha — like a file explorer.
const sortEntries = (a: GhEntry, b: GhEntry) =>
  a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1;

function makeSource(repo: string): TreeSource {
  const errNode = (path: string, why: string): TreeNodeData[] => [
    { id: `__err:${path}`, label: `⚠ ${why}`, type: "error", payload: { leaf: true } },
  ];
  const fetchPath = async (path: string): Promise<TreeNodeData[]> => {
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) {
        return errNode(path, res.status === 403 ? "rate limit hit (60/hr unauthenticated)" : `HTTP ${res.status}`);
      }
      const data = (await res.json()) as GhEntry[];
      if (!Array.isArray(data)) return [];
      return data.sort(sortEntries).map(toNode);
    } catch (e) {
      return errNode(path, `network error: ${(e as Error).message}`); // offline / DNS / CORS
    }
  };
  return {
    getRoots: () => fetchPath(""),
    getChildren: (node) => fetchPath((node.payload as any).path),
  };
}

const renderLabel = (n: TreeNodeData): JSX.Element => {
  const size = (n.payload as any)?.size as number | undefined;
  return (
    <span>
      {n.label}
      <Show when={n.payload?.leaf && size != null && size > 0}>
        <span style="color:#94a3b8;margin-left:8px;font-size:.85em">{fmtSize(size!)}</span>
      </Show>
    </span>
  );
};

const PRESETS = ["solidjs/solid", "facebook/react", "honojs/hono", "tailwindlabs/tailwindcss"];

export const GithubDemo: Component = () => {
  const [repo, setRepo] = createSignal("solidjs/solid");
  const [draft, setDraft] = createSignal(repo());
  const [domRows, setDomRows] = createSignal(0);

  return (
    <div style="font-family:system-ui;padding:16px;max-width:560px">
      <h2>GitHub repo browser</h2>
      <p style="font-size:13px;color:#555">
        <code>&lt;DatabaseTree&gt;</code> whose <code>TreeSource</code> is the live GitHub REST
        API — expand a folder to <strong>lazy-fetch</strong> its contents over the network
        (watch the spinner). Cached per path via TanStack Query; windowed ({domRows()} in DOM).
        No fake delays. (Unauthenticated: ~60 req/hr.)
      </p>
      <form
        style="display:flex;gap:6px;margin-bottom:6px"
        onSubmit={(e) => {
          e.preventDefault();
          setRepo(draft().trim());
        }}
      >
        <input
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="owner/repo"
          style="flex:1;padding:6px 8px;font-size:13px"
        />
        <button type="submit">Load</button>
      </form>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:12px">
        {PRESETS.map((r) => (
          <button onClick={() => { setDraft(r); setRepo(r); }} style="font-size:12px">{r}</button>
        ))}
      </div>
      <div style="height:440px;border:1px solid #ccc;border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:rgba(59,130,246,.14)">
        {/* keyed: switching repo remounts the tree (fresh controller + cache) */}
        <Show when={repo()} keyed>
          {(r) => (
            <DatabaseTree
              source={makeSource(r)}
              renderLabel={renderLabel}
              onSelect={() => {}}
              onRangeChange={(s, e) => setDomRows(e - s + 1)}
            />
          )}
        </Show>
      </div>
    </div>
  );
};
