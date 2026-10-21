import { Show, createSignal } from "solid-js";
import { createClient } from "@supabase/supabase-js";
import { SupabaseTree, createSupabaseTreeController, type TreeNodeData } from "@timotholt/solid-tree/supabase";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 11,
  title: "Supabase + record locks",
  description:
    "<SupabaseTree> over a real table: lazy rows, live realtime, and server-enforced 'one editor per record' locks. Without Supabase env vars it shows how to set one up.",
  tags: ["supabase", "realtime", "locking"],
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
    <Show when={SB_URL && SB_KEY} fallback={<HowTo />}>
      <Live url={SB_URL!} anonKey={SB_KEY!} />
    </Show>
  );
}

export const check: ExampleCheck = async (root, h) => {
  // Tests run without env vars (and without network): the how-to panel must render.
  if (SB_URL && SB_KEY) return;
  const howto = root.querySelector('[data-testid="howto"]');
  h.expect(howto).not.toBeNull();
  h.expect(howto!.textContent).toContain("VITE_SUPABASE_URL");
  h.expect(howto!.textContent).toContain("solid_tree.install_lock");
  h.expect(howto!.textContent).toContain("acquireLock");
  h.expect(root.querySelector('[role="tree"]')).toBeNull();
};
