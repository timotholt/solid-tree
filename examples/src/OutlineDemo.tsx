// Collaborative outline (?outline) — add / rename / remove on a shared Supabase tree, live
// across two real sessions. Clicking a node AUTO-LOCKS it (atomic acquire — refused if
// another user holds it: 🔒 yours, 👤 theirs; moving to another node releases the prior).
// rename / +child / remove are gated on holding it; remove is subtree-aware (can't delete a
// node whose descendant another user holds). Genuinely lazy (children load on expand;
// leaf-ness from child_count). Mount via /?outline.
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
  // Distinct storageKey per column: two clients on one origin otherwise share the default
  // auth storage key and their sessions collide (clicks run as the wrong user).
  const client: SupabaseClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: true, storageKey: `sb-outline-${props.name}` },
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
    <div style="flex:1;min-width:300px">
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

  const tree = createSupabaseTreeController({
    client: props.client,
    table: TABLE,
    toNode,
    parentColumn: "parent_id",
    orderBy: { column: "created_at" },
    lockRpc: LOCK_RPC,
    // Can't even select a node another user holds — clicking it is a no-op.
    canSelect: (n) => {
      const lb = n.payload?.lockedBy as string | null;
      return !(lb && lb !== props.uid);
    },
    // Auto-lock on select (atomic — refused if another user holds it; moving to another
    // node releases the prior one). No manual lock/unlock buttons.
    onSelect: async (n) => {
      setSelLabel(n.label);
      await tree.acquireLock(n.id);
    },
    onLockLost: () => {},
  });

  const sel = () => tree.selectedId();
  const hold = () => !!sel() && tree.heldId() === sel(); // you hold the selected node

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

  const btnStyle = "font-size:13px";
  return (
    <>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="new label…"
          style="flex:1;min-width:0;padding:5px 7px;font-size:13px"
        />
        <button style={btnStyle} disabled={!draft().trim()} onClick={() => add(null)}>+ root</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <button style={btnStyle} disabled={!hold() || !draft().trim()} onClick={() => add(sel())}>+ child</button>
        <button style={btnStyle} disabled={!hold()} onClick={rename}>rename</button>
        <button style={btnStyle} disabled={!hold()} onClick={remove}>remove</button>
      </div>
      <div style="font-size:12px;opacity:.65;margin-bottom:6px">
        {sel() ? (hold() ? "🔒 you hold this node — edit away" : "👤 locked by the other user") : "click a node to lock + edit it"} · {domRows()} in DOM
      </div>
      <div style={`height:340px;border:2px solid ${props.accent};border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:${props.accent}22`}>
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
    <div style="font-family:system-ui;padding:16px;max-width:820px">
      <h2>Collaborative outline — click to lock, add / rename / remove</h2>
      <p style="font-size:13px;color:#555">
        Two real Supabase sessions on a shared <code>scratch_outline</code> tree. Type a
        label → <strong>+ root</strong>. <strong>Clicking a node locks it</strong> (atomic —
        the other user can't lock the same node, they see 👤; moving to another node releases
        it). While you hold it you can <strong>+ child</strong> / <strong>rename</strong> /
        <strong>remove</strong>; remove is subtree-aware (can't delete a node whose descendant
        the other user holds). Lazy + live over Realtime. Try: both click Roadmap → only one
        gets 🔒.
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
