import { Show, createSignal } from "solid-js";
import { createClient } from "@supabase/supabase-js";
import { SupabaseTree, createSupabaseTreeController, type TreeNodeData } from "@timotholt/solid-tree/supabase";
import type { ExampleCheck, ExampleMeta } from "../example.js";
import { TwoUserLockDemo, TTL_SECONDS } from "../lib/TwoUserLockDemo.js";

export const meta: ExampleMeta = {
  order: 11,
  title: "Supabase + record locks",
  description:
    "Two users side by side, one real Postgres running in your browser with the production lock SQL, row-level security and realtime. Lock a document as Alice and watch Bob get refused; go idle and the lock expires; Bob (admin) can force-release.",
  tags: ["supabase", "realtime", "locking", "no backend needed"],
};

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TABLE = (import.meta.env.VITE_SUPABASE_TABLE as string | undefined) ?? "documents";

const usage = `import { createClient } from "@supabase/supabase-js";
import { SupabaseTree, createSupabaseTreeController } from "@timotholt/solid-tree/supabase";

const supabase = createClient(URL, ANON_KEY); // sign the user in: lock RPCs need "authenticated"

const tree = createSupabaseTreeController({
  client: supabase,
  table: "documents",
  parentColumn: "parent_id",
  toNode: (row) => ({ id: row.id, label: row.title, type: "doc",
    payload: { leaf: !row.child_count, lockedBy: row.locked_by } }),
  lockedBy: (node) => node.payload?.lockedBy ?? null,
  // Lock on select: atomic on the server, refused if someone else holds it.
  onSelect: (node) => void tree.acquireLock(node.id),
  onLockLost: (id) => alert(\`Lost the lock on \${id}\`),
  // lockRpc: { acquireFn: "tasks_acquire_lock", touchFn: "tasks_touch_lock",
  //            releaseFn: "tasks_release_lock", releaseAllFn: "tasks_release_all_locks" },
});

<SupabaseTree tree={tree} ariaLabel="Documents" />
// tree.heldId() → the id you hold (or null); tree.releaseLock() lets it go.`;

function HowTo() {
  return (
    <section class="panel" data-testid="howto" aria-labelledby="sb-howto">
      <h2 id="sb-howto" style={{ "margin-top": 0, "font-size": "18px" }}>How to run this example</h2>
      <ol>
        <li>
          Create <code>examples/.env.local</code> with <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{" "}
          (Supabase dashboard → Settings → API), optionally <code>VITE_SUPABASE_TABLE</code> (default <code>documents</code>).
        </li>
        <li>
          Run <code>supabase/migrations/0003_solid_tree_lock.sql</code> once (SQL editor or your migration tool).
        </li>
        <li>
          Install locking on your table: <code>select solid_tree.install_lock('public.documents');</code> This adds{" "}
          <code>locked_by</code> / <code>locked_at</code> and the lock RPCs. With <code>prefix =&gt; 'tasks_'</code> the RPCs are
          prefixed, so pass matching names in <code>lockRpc</code>.
        </li>
        <li>Restart the dev server. Locks are per signed-in user, so sign in before selecting rows.</li>
      </ol>
      <pre tabIndex={0} aria-label="Code sample" style={{ overflow: "auto", "font-size": "12.5px" }}>
        <code>{usage}</code>
      </pre>
    </section>
  );
}

function Live(props: { url: string; anonKey: string }) {
  const client = createClient(props.url, props.anonKey);
  const [status, setStatus] = createSignal("Select a row to lock it.");
  const tree = createSupabaseTreeController({
    client,
    table: TABLE,
    toNode: (row: Record<string, any>): TreeNodeData => ({
      id: String(row.id),
      label: String(row.title ?? row.label ?? row.name ?? row.id),
      type: "row",
      payload: { leaf: row.child_count != null ? Number(row.child_count) === 0 : undefined, lockedBy: row.locked_by ?? null },
    }),
    lockedBy: (n) => n.payload?.lockedBy ?? null,
    onSelect: async (n) => setStatus((await tree.acquireLock(n.id)) ? `You hold ${n.label}` : `${n.label} is locked by someone else`),
    onLockLost: (id) => setStatus(`Lost the lock on ${id}`),
  });
  return (
    <div class="split">
      <SupabaseTree tree={tree} ariaLabel={`Rows of ${TABLE}`} viewportStyle={{ height: "320px" }} />
      <div class="panel" aria-live="polite">
        <p>{status()}</p>
        <p>
          Held: <code>{tree.heldId() ?? "nothing"}</code>
        </p>
        <div class="toolbar">
          <button type="button" disabled={!tree.selectedId()} onClick={() => void tree.acquireLock(tree.selectedId()!)}>
            Lock selected
          </button>
          <button type="button" disabled={!tree.heldId()} onClick={() => void tree.releaseLock()}>
            Release lock
          </button>
          <button type="button" onClick={() => void tree.refreshLock()}>
            Refresh lock
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupabaseLocks() {
  return (
    <>
      <p class="muted">
        Each pane is an unmodified <code>&lt;SupabaseTree&gt;</code> signed in as a different user. Things to try: lock a document
        in one pane and click it in the other; press <em>Edit selected</em> without holding the lock (row-level security refuses
        it); press <em>Go idle</em> and wait {TTL_SECONDS}s — the lock expires and the other user can take it.
      </p>
      <TwoUserLockDemo />
      <h2 style={{ "font-size": "17px", "margin-top": "24px" }}>Use your own Supabase</h2>
      <Show when={SB_URL && SB_KEY} fallback={<HowTo />}>
        <Live url={SB_URL!} anonKey={SB_KEY!} />
      </Show>
    </>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const pane = (user: string) => root.querySelector<HTMLElement>(`[data-user="${user}"]`)!;
  const status = (user: string) => root.querySelector(`[data-testid="status-${user}"]`)!.textContent ?? "";
  const label = (user: string, id: string) => h.row(id, pane(user)).textContent ?? "";
  const button = (user: string, text: string) =>
    Array.from(pane(user).querySelectorAll("button")).find((b) => b.textContent?.startsWith(text))!;
  const until = async (ok: () => boolean, what: string) => {
    for (let i = 0; i < 100 && !ok(); i++) await h.settle(50);
    h.expect(ok() ? what : `timed out waiting for: ${what}`).toBe(what);
  };

  // Postgres boots in the page (WASM, a ~5.5 MB download on first visit), then both
  // panes load the table. Allow a slow connection up to 60 s.
  for (let i = 0; i < 600 && !(pane("alice") && pane("bob") && h.has("budget", pane("alice")) && h.has("budget", pane("bob"))); i++) await h.settle(100);
  await until(() => !!pane("alice") && !!pane("bob") && h.has("budget", pane("alice")) && h.has("budget", pane("bob")), "both panes loaded");

  // Alice locks Budget; Bob sees it arrive over realtime.
  await h.click(h.row("budget", pane("alice")));
  await until(() => status("alice").includes("Locked"), "alice holds budget");
  await until(() => label("bob", "budget").includes("alice"), "bob sees alice's lock");
  h.expect(label("alice", "budget")).toContain("you");

  // Bob is refused, and row-level security refuses his edit.
  await h.click(h.row("budget", pane("bob")));
  await until(() => status("bob").includes("locked by someone else"), "bob refused");
  button("bob", "Edit selected").click();
  await until(() => status("bob").includes("refused by row-level security"), "bob's edit refused");

  // Alice can edit; Bob (admin) force-releases; Alice learns she lost it.
  button("alice", "Edit selected").click();
  await until(() => status("alice").includes("Edit saved"), "alice's edit saved");
  await until(() => label("bob", "budget").includes("edited by Alice"), "bob sees the edit live");
  button("bob", "Force-release").click();
  await until(() => status("alice").includes("Lost the lock"), "alice told she lost the lock");

  // Now Bob can take it.
  await h.click(h.row("budget", pane("bob")));
  await until(() => status("bob").includes("Locked"), "bob holds budget");
  button("bob", "Release").click();
  await until(() => !label("alice", "budget").includes("🔒"), "lock released everywhere");

  // The "use your own Supabase" guide is there (no env vars in tests).
  if (!(SB_URL && SB_KEY)) h.expect(root.querySelector('[data-testid="howto"]')).not.toBeNull();
};
