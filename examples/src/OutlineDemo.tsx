// Collaborative outline (?outline) — a DIFFERENT Supabase demo: two real sessions edit a
// SHARED, MUTABLE tree. Add / rename / remove nodes via SECURITY DEFINER RPCs; the
// STRUCTURE syncs live across both columns via Realtime INSERT / UPDATE / DELETE (the
// bank demo only does UPDATE + lock). Uses createDatabaseTreeController over a Supabase
// source — no locking here. Mount via /?outline.
//
// Prereq: `npm run setup` in ../../supabase (adds scratch_outline + RPCs) + .env set.
import { createSignal, onMount, Show, type Component } from "solid-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DatabaseTree, createDatabaseTreeController } from "@timotholt/solid-tree/database";
import { supabaseSource } from "@timotholt/solid-tree/supabase";
import type { TreeNodeData } from "@timotholt/solid-tree/database";
import "@timotholt/solid-tree/theme.css";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TABLE = "scratch_outline";

// Every node is expandable (you can add children to any). A node with no children loads
// empty on expand and drops its chevron.
const toNode = (row: Record<string, any>): TreeNodeData => ({
  id: row.id,
  label: row.label,
  type: "node",
  payload: { leaf: false },
});

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
  const [draft, setDraft] = createSignal("");
  const [domRows, setDomRows] = createSignal(0);

  // DB controller over the Supabase outline table (no lock layer).
  const tree = createDatabaseTreeController({
    source: supabaseSource({
      client: props.client,
      table: TABLE,
      toNode,
      parentColumn: "parent_id",
      orderBy: { column: "created_at" },
    }),
  });

  const sel = () => tree.selectedId();
  const add = async (parent: string | null) => {
    await props.client.rpc("outline_add", { _parent: parent, _label: draft() });
    setDraft("");
    if (parent) await tree.expand(parent); // reveal the new child
  };
  const remove = async () => {
    const id = sel();
    if (!id) return;
    await props.client.rpc("outline_remove", { _id: id });
    tree.deselect();
  };
  const rename = async () => {
    const id = sel();
    if (id && draft().trim()) {
      await props.client.rpc("outline_rename", { _id: id, _label: draft() });
      setDraft("");
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
        <DatabaseTree tree={tree} onRangeChange={(s, e) => setDomRows(e - s + 1)} />
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
        DEFINER RPCs (RLS denies direct writes); the <em>structure</em> syncs live across
        both columns via Realtime INSERT/UPDATE/DELETE. (Add a root on the left → watch it
        appear on the right. No locking here — that's the <em>&lt;SupabaseTree&gt;</em> demo.)
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
