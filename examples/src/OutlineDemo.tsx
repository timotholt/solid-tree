// Collaborative outline (?outline) — two real Supabase sessions edit a SHARED, MUTABLE
// tree. Add / rename / remove via SECURITY DEFINER RPCs; the structure syncs live across
// both columns. An outline is small, so we FULL-LOAD it (one select → nested tree) instead
// of lazy-loading — that way children are known, so leaves correctly show NO chevron, and
// a node that gains its first child correctly grows one. Realtime: any change → refetch +
// rebuild. Driven by a base createTreeController over the in-memory tree. Mount via /?outline.
//
// Prereq: `npm run setup` in ../../supabase (adds scratch_outline + RPCs) + .env set.
import { createSignal, onCleanup, onMount, Show, type Component } from "solid-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { VirtualTree, createTreeController } from "@timotholt/solid-tree/virtual";
import type { TreeNodeData } from "@timotholt/solid-tree/virtual";
import "@timotholt/solid-tree/theme.css";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TABLE = "scratch_outline";

interface Row { id: string; parent_id: string | null; label: string }

// Flat rows → nested TreeNodeData. Leaves get NO children key, so no chevron.
function buildTree(rows: Row[]): TreeNodeData[] {
  const byId = new Map<string, TreeNodeData & { children: TreeNodeData[] }>();
  for (const r of rows) byId.set(r.id, { id: r.id, label: r.label, type: "node", children: [] });
  const roots: TreeNodeData[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    const parent = r.parent_id ? byId.get(r.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  }
  for (const n of byId.values()) if (n.children.length === 0) delete (n as TreeNodeData).children;
  return roots;
}

const Column: Component<{ email: string; password: string; name: string; accent: string }> = (props) => {
  const client: SupabaseClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const [ready, setReady] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);

  onMount(async () => {
    const { error } = await client.auth.signInWithPassword({ email: props.email, password: props.password });
    if (error) return setErr(error.message);
    setReady(true);
  });

  return (
    <div style="flex:1;min-width:280px">
      <h3 style={`margin:0 0 6px;color:${props.accent}`}>{props.name}</h3>
      <Show when={err()}>
        <p style="color:#b91c1c;font-size:13px">sign-in failed: {err()} — setup + .env?</p>
      </Show>
      <Show when={ready()} fallback={<p style="font-size:13px;opacity:.6">signing in…</p>}>
        {() => <OutlineColumn client={client} accent={props.accent} />}
      </Show>
    </div>
  );
};

const OutlineColumn: Component<{ client: SupabaseClient; accent: string }> = (props) => {
  const [data, setData] = createSignal<TreeNodeData[]>([]);
  const [draft, setDraft] = createSignal("");
  const [domRows, setDomRows] = createSignal(0);
  const tree = createTreeController({ data: () => data() });

  const refetch = async () => {
    const { data: rows } = await props.client
      .from(TABLE).select("id,parent_id,label,created_at").order("created_at");
    setData(buildTree((rows ?? []) as Row[]));
  };

  onMount(() => {
    void refetch();
    // One channel; any change to the shared table → refetch + rebuild (table is tiny).
    const ch = props.client
      .channel(`outline:${props.accent}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => void refetch())
      .subscribe();
    onCleanup(() => void props.client.removeChannel(ch));
  });

  const sel = () => tree.selectedId();
  const add = async (parent: string | null) => {
    await props.client.rpc("outline_add", { _parent: parent, _label: draft() });
    setDraft("");
    await refetch();
    if (parent) tree.expand(parent); // reveal the new child
  };
  const remove = async () => {
    const id = sel();
    if (!id) return;
    await props.client.rpc("outline_remove", { _id: id });
    tree.deselect();
    await refetch();
  };
  const rename = async () => {
    const id = sel();
    if (id && draft().trim()) {
      await props.client.rpc("outline_rename", { _id: id, _label: draft() });
      setDraft("");
      await refetch();
    }
  };

  return (
    <>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="label…"
          style="flex:1;min-width:0;padding:5px 7px;font-size:13px"
        />
        <button onClick={() => add(null)}>+ root</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px;font-size:13px">
        <button disabled={!sel()} onClick={() => add(sel())}>+ child</button>
        <button disabled={!sel() || !draft().trim()} onClick={rename}>rename</button>
        <button disabled={!sel()} onClick={remove}>remove</button>
        <span style="flex:1" />
        <span style="opacity:.6;font-size:12px;align-self:center">{domRows()} in DOM</span>
      </div>
      <div style={`height:360px;border:2px solid ${props.accent};border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:${props.accent}22`}>
        <VirtualTree tree={tree} onRangeChange={(s, e) => setDomRows(e - s + 1)} />
      </div>
    </>
  );
};

export const OutlineDemo: Component = () => {
  const configured = URL && ANON && !ANON.includes("paste-anon");
  return (
    <div style="font-family:system-ui;padding:16px;max-width:760px">
      <h2>Collaborative outline — live insert / remove</h2>
      <p style="font-size:13px;color:#555">
        Two real Supabase sessions on a shared <code>scratch_outline</code> table. Type a
        label, <strong>+ root</strong> or select a node and <strong>+ child</strong> /{" "}
        <strong>rename</strong> / <strong>remove</strong>. Mutations go through SECURITY
        DEFINER RPCs (RLS denies direct writes); every change syncs live across both columns
        via Realtime. Full-loaded so leaves show no chevron. (Add a root on the left → watch
        it appear on the right.)
      </p>
      <Show
        when={configured}
        fallback={
          <p style="color:#b91c1c;font-size:13px">
            Not configured. <code>cp .env.example .env</code> + set
            <code> VITE_SUPABASE_ANON_KEY</code>, and run <code>npm run setup</code> in{" "}
            <code>supabase/</code>.
          </p>
        }
      >
        <div style="display:flex;gap:16px">
          <Column email={import.meta.env.VITE_TEST_A_EMAIL as string} password={import.meta.env.VITE_TEST_A_PASS as string} name="Tim" accent="#2563eb" />
          <Column email={import.meta.env.VITE_TEST_B_EMAIL as string} password={import.meta.env.VITE_TEST_B_PASS as string} name="Gf" accent="#db2777" />
        </div>
      </Show>
    </div>
  );
};
