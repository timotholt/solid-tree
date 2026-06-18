// Collaborative outline (?outline) — two real Supabase sessions edit a SHARED, MUTABLE
// tree, with RECORD LOCKING. Selecting a node acquires its lock (🔒 yours, 👤 someone
// else's); rename / remove / add-child are server-refused when another user holds it — so
// a node you're working in can't be renamed or deleted out from under you. Genuinely lazy
// (createSupabaseTreeController → children fetched on expand; leaf-ness from child_count).
// Mount via /?outline.
//
// Prereq: `npm run setup` in ../../supabase (adds scratch_outline + lock RPCs) + .env set.
import { createSignal, onMount, Show, type Component } from "solid-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTree, createSupabaseTreeController } from "@timotholt/solid-tree/supabase";
import type { TreeNodeData } from "@timotholt/solid-tree/supabase";
import "@timotholt/solid-tree/theme.css";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TABLE = "scratch_outline";
const LOCK_RPC = {
  acquireFn: "outline_lock",
  releaseFn: "outline_unlock",
  releaseAllFn: "outline_unlock_all",
  touchFn: "outline_touch",
};

const toNode = (row: Record<string, any>): TreeNodeData => ({
  id: row.id,
  label: row.label,
  type: "node",
  payload: { leaf: Number(row.child_count ?? 0) === 0, lockedBy: row.locked_by as string | null },
});

const Column: Component<{ email: string; password: string; name: string; accent: string }> = (props) => {
  const client: SupabaseClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const [ready, setReady] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);
  const [uid, setUid] = createSignal<string | null>(null);

  onMount(async () => {
    const { data, error } = await client.auth.signInWithPassword({ email: props.email, password: props.password });
    if (error) return setErr(error.message);
    setUid(data.user?.id ?? null);
    setReady(true);
  });

  return (
    <div style="flex:1;min-width:280px">
      <h3 style={`margin:0 0 6px;color:${props.accent}`}>{props.name}</h3>
      <Show when={err()}>
        <p style="color:#b91c1c;font-size:13px">sign-in failed: {err()} — setup + .env?</p>
      </Show>
      <Show when={ready()} fallback={<p style="font-size:13px;opacity:.6">signing in…</p>}>
        {() => <OutlineColumn client={client} uid={uid()!} accent={props.accent} />}
      </Show>
    </div>
  );
};

const OutlineColumn: Component<{ client: SupabaseClient; uid: string; accent: string }> = (props) => {
  const [draft, setDraft] = createSignal("");
  const [selLabel, setSelLabel] = createSignal("");
  const [domRows, setDomRows] = createSignal(0);

  // Lazy Supabase controller + record lock (lock RPCs point at the outline_* functions).
  const tree = createSupabaseTreeController({
    client: props.client,
    table: TABLE,
    toNode,
    parentColumn: "parent_id",
    orderBy: { column: "created_at" },
    lockRpc: LOCK_RPC,
    // Selecting a node grabs its lock (one editor → one lock). If refused, you don't hold it.
    onSelect: async (n) => {
      setSelLabel(n.label);
      await tree.acquireLock(n.id);
    },
  });

  const sel = () => tree.selectedId();
  const hold = () => !!sel() && tree.heldId() === sel(); // you currently hold the selected node

  const add = async (parent: string | null) => {
    await props.client.rpc("outline_add", { _parent: parent, _label: draft() });
    setDraft("");
    if (parent) tree.expand(parent);
  };
  const remove = async () => {
    const id = sel();
    if (!id) return;
    const { data: ok } = await props.client.rpc("outline_remove", { _id: id });
    if (ok === false) {
      window.alert("Can't remove — this node or a descendant is locked by another user.");
      return;
    }
    await tree.releaseLock();
    tree.deselect();
  };
  const rename = async () => {
    const id = sel();
    if (!id) return;
    const next = window.prompt("Rename node:", selLabel());
    if (next && next.trim()) {
      await props.client.rpc("outline_rename", { _id: id, _label: next });
      setSelLabel(next.trim());
    }
  };

  return (
    <>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="new label…"
          style="flex:1;min-width:0;padding:5px 7px;font-size:13px"
        />
        <button disabled={!draft().trim()} onClick={() => add(null)}>+ root</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px;font-size:13px">
        <button disabled={!hold() || !draft().trim()} onClick={() => add(sel())}>+ child</button>
        <button disabled={!hold()} onClick={rename}>rename</button>
        <button disabled={!hold()} onClick={remove}>remove</button>
        <span style="flex:1" />
        <span style="opacity:.6;font-size:12px;align-self:center">{domRows()} in DOM</span>
      </div>
      <div style={`height:360px;border:2px solid ${props.accent};border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:${props.accent}22`}>
        <SupabaseTree
          tree={tree}
          onRangeChange={(s, e) => setDomRows(e - s + 1)}
          renderActionNode={(n) => {
            const lb = n.payload?.lockedBy as string | null;
            if (lb === props.uid) return <span title="you hold the lock">🔒</span>;
            if (lb) return <span style="font-size:11px;color:#b45309">👤 locked</span>;
            return null;
          }}
        />
      </div>
    </>
  );
};

export const OutlineDemo: Component = () => {
  const configured = URL && ANON && !ANON.includes("paste-anon");
  return (
    <div style="font-family:system-ui;padding:16px;max-width:760px">
      <h2>Collaborative outline — lazy, locked, live</h2>
      <p style="font-size:13px;color:#555">
        Two real Supabase sessions on a shared <code>scratch_outline</code> table. Type a
        label and <strong>+ root</strong>; or click a node to <strong>lock</strong> it (🔒
        yours, 👤 theirs) and <strong>+ child</strong> / <strong>rename</strong> /{" "}
        <strong>remove</strong>. While you hold a node, the other user can't rename or delete
        it (server-enforced via SECURITY DEFINER RPCs) — so children can't be deleted out
        from under you. Genuinely lazy (children load on expand); changes sync live via
        Realtime. Try: lock Q4 goals on the left → watch 👤 appear on the right and their
        remove refuse.
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
          <Column email={import.meta.env.VITE_TEST_B_EMAIL as string} password={import.meta.env.VITE_TEST_B_PASS as string} name="Sarah" accent="#db2777" />
        </div>
      </Show>
    </div>
  );
};
