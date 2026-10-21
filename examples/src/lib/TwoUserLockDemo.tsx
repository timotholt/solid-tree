import { For, Show, createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import { QueryClient } from "@tanstack/solid-query";
import { SupabaseTree, createSupabaseTreeController, type TreeNodeData } from "@timotholt/solid-tree/supabase";
import { createPGliteSupabase, type PGliteSupabase } from "@timotholt/solid-tree/testing";

// Two users, one tab, one real Postgres running in this page (PGlite). The lock SQL,
// row-level security and realtime triggers are the same ones production Supabase runs;
// only the network is simulated. Each pane is an unmodified <SupabaseTree>.

const TTL_SECONDS = 15;
const SEED = `
  create table public.docs (
    id text primary key, title text not null,
    parent_id text references public.docs(id), has_children boolean not null default false);
  insert into public.docs values
    ('plan', 'Q3 plan', null, true),
    ('budget', 'Budget', 'plan', false),
    ('hiring', 'Hiring plan', 'plan', false),
    ('roadmap', 'Roadmap', 'plan', false),
    ('notes', 'Meeting notes', null, true),
    ('kickoff', 'Kickoff', 'notes', false),
    ('retro', 'Retro', 'notes', false);`;

const toNode = (r: Record<string, any>): TreeNodeData => ({
  id: r.id,
  label: r.title,
  type: "doc",
  payload: { leaf: !r.has_children, lockedBy: r.locked_by ?? null },
});

export interface DemoHandle {
  sb: PGliteSupabase;
}

/** Boots Postgres in the browser once, then renders the two panes. */
export function TwoUserLockDemo(props: { onReady?: (h: DemoHandle) => void }) {
  const [sb, setSb] = createSignal<PGliteSupabase>();
  const [error, setError] = createSignal("");
  // First visit downloads Postgres compiled to WebAssembly (~5.5 MB gzipped); the browser
  // caches it after that. Show progress so a slow connection never looks like a hang.
  const [elapsed, setElapsed] = createSignal(0);
  const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
  onCleanup(() => clearInterval(tick));
  let db: { close(): Promise<void> } | undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    void db?.close();
  });
  onMount(async () => {
    try {
      const { PGlite } = await import("@electric-sql/pglite");
      if (disposed) return;
      const pg = new PGlite();
      db = pg;
      const s = await createPGliteSupabase(pg);
      await s.exec(SEED);
      await s.enableRealtime("public.docs");
      // Short TTL so expiry is watchable; only the holder may edit (RLS).
      await s.installLock("public.docs", { ttl: `${TTL_SECONDS} seconds`, protectUpdates: true });
      if (disposed) return;
      clearInterval(tick);
      setSb(s);
      props.onReady?.({ sb: s });
    } catch (e) {
      clearInterval(tick);
      setError(String((e as Error)?.message ?? e));
    }
  });
  return (
    <Show
      when={sb()}
      fallback={
        <p class="muted" role="status">
          {error()
            ? `Could not start Postgres: ${error()}`
            : `Starting Postgres in your browser… ${elapsed()}s (the first visit downloads about 5.5 MB of WebAssembly; later visits use the browser cache)`}
        </p>
      }
    >
      {(s) => (
        <div class="split" style={{ "grid-template-columns": "1fr 1fr" }}>
          <Pane sb={s} user="alice" />
          <Pane sb={s} user="bob" admin />
        </div>
      )}
    </Show>
  );
}

function Pane(props: { sb: Accessor<PGliteSupabase>; user: string; admin?: boolean }) {
  const name = props.user[0].toUpperCase() + props.user.slice(1);
  const client = props.sb().clientFor(props.user);
  const me = props.sb().uuidOf(props.user);
  const [idle, setIdle] = createSignal(false);
  const [status, setStatus] = createSignal("Click a document to lock it.");
  const [log, setLog] = createSignal<string[]>([]);
  const note = (msg: string) => {
    setStatus(msg);
    setLog((l) => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 5));
  };

  const tree = createSupabaseTreeController({
    client,
    table: "docs",
    parentColumn: "parent_id",
    toNode,
    lockedBy: (n) => n.payload?.lockedBy ?? null,
    queryClient: new QueryClient(),
    defaultExpandedIds: ["plan", "notes"],
    heartbeatMs: 3000,
    // "Go idle" simulates a laptop that went to sleep: no heartbeats, so the lock expires.
    heartbeatPolicy: () => !idle(),
    releaseOnDispose: false,
    onSelect: async (n) => note((await tree.acquireLock(n.id)) ? `Locked “${n.label}”.` : `“${n.label}” is locked by someone else.`),
    onLockLost: (id) => note(`Lost the lock on “${tree.index().get(id)?.label ?? id}” (it expired or was released by an admin).`),
  });

  const ownerOf = (n: TreeNodeData) => {
    const by = n.payload?.lockedBy as string | null;
    if (!by) return "";
    return by === me ? " 🔒 you" : ` 🔒 ${props.sb().nameOf(by) ?? "someone"}`;
  };
  const selected = () => tree.selectedId();
  const rename = async () => {
    const id = selected();
    if (!id) return;
    const { data } = await client.from("docs").update({ title: `${tree.index().get(id)?.label} (edited by ${name})` }).eq("id", id);
    note(data?.length ? "Edit saved — you hold the lock." : "Edit refused by row-level security: you don't hold this lock.");
  };
  const forceRelease = async () => {
    const id = selected();
    if (!id) return;
    const { error } = await props.sb().clientFor(`${props.user}-admin`, { admin: true }).rpc("admin_force_release", { _id: id });
    note(error ? `Admin override failed: ${error.message}` : `Admin: force-released “${tree.index().get(id)?.label}”.`);
  };

  return (
    <section class="panel" aria-label={`${name}'s screen`} data-user={props.user}>
      <h2 style={{ margin: "0 0 8px", "font-size": "15px" }}>
        {name}
        {props.admin ? " (admin)" : ""}
      </h2>
      <SupabaseTree tree={tree} ariaLabel={`${name}'s documents`} viewportStyle={{ height: "190px" }} renderLabel={(n) => <span>{n.label}{ownerOf(n)}</span>} />
      <p role="status" data-testid={`status-${props.user}`} style={{ "min-height": "2.6em" }}>
        {status()}
      </p>
      <div class="toolbar">
        <button type="button" disabled={!tree.heldId()} onClick={() => void tree.releaseLock().then(() => note("Released."))}>
          Release
        </button>
        <button type="button" disabled={!selected()} onClick={rename}>
          Edit selected
        </button>
        <button type="button" aria-pressed={idle()} onClick={() => setIdle((v) => !v)}>
          {idle() ? "Wake up" : "Go idle"}
        </button>
        <Show when={props.admin}>
          <button type="button" disabled={!selected()} onClick={forceRelease}>
            Force-release (admin)
          </button>
        </Show>
      </div>
      <ul class="muted" style={{ margin: "6px 0 0", "padding-left": "16px" }} aria-label={`${name}'s activity`}>
        <For each={log()}>{(l) => <li>{l}</li>}</For>
      </ul>
    </section>
  );
}

export { TTL_SECONDS };
