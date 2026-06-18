// Two-column collaborative demo on a REAL Supabase backend (table scratch_lock_demo).
// Driven by createSupabaseTreeController: the controller owns the source/cache/lazy/
// realtime AND the record lock; the demo just calls controller.acquireLock / releaseLock
// / heldId and renders <SupabaseTree tree={controller}/>. Two real auth sessions.
// Mount via /?supabase.
//
// Prereq: run `npm run setup` in ../../supabase (creates table + RPCs + users),
// then `cp .env.example .env` here and fill VITE_SUPABASE_ANON_KEY.
import { createSignal, onMount, Show, type Component } from "solid-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTree, createSupabaseTreeController } from "@timotholt/solid-tree/supabase";
import type { TreeNodeData } from "@timotholt/solid-tree/supabase";
import "@timotholt/solid-tree/theme.css";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TABLE = "scratch_lock_demo";

const toNode = (row: Record<string, any>): TreeNodeData => {
  const leaf = row.kind === "leaf";
  return {
    id: row.id,
    label: leaf ? `${row.label} — $${Number(row.balance ?? 0).toFixed(2)}` : row.label,
    type: leaf ? "account" : "group",
    payload: { leaf, lockedBy: row.locked_by as string | null },
  };
};

// Sign-in shell: builds the controller only AFTER auth (so the roots query runs
// authenticated under RLS), then renders ColumnInner.
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
    <div style="flex:1;min-width:300px">
      <h3 style={`margin:0 0 6px;color:${props.accent}`}>{props.name} (real Supabase)</h3>
      <Show when={err()}>
        <p style="color:#b91c1c;font-size:13px">sign-in failed: {err()} — did you run setup + set .env?</p>
      </Show>
      <Show when={ready()} fallback={<p style="font-size:13px;opacity:.6">signing in…</p>}>
        {() => <ColumnInner client={client} uid={uid()!} name={props.name} accent={props.accent} />}
      </Show>
    </div>
  );
};

const ColumnInner: Component<{ client: SupabaseClient; uid: string; name: string; accent: string }> = (props) => {
  const [heldLabel, setHeldLabel] = createSignal<string | null>(null);
  const [domRows, setDomRows] = createSignal(0);
  const [total, setTotal] = createSignal(0);

  // The controller owns source/cache/lazy/realtime + the lock. Built post-auth.
  const tree = createSupabaseTreeController({
    client: props.client,
    table: TABLE,
    toNode,
    parentColumn: "parent_id",
    orderBy: { column: "label" },
    onLockLost: () => setHeldLabel(null),
    onSelect: async (n) => {
      // Groups aren't lockable — release whatever we held. (Expand = chevron, not select.)
      if (!n.payload?.leaf) {
        setHeldLabel(null);
        await tree.releaseLock();
        return;
      }
      const lb = n.payload?.lockedBy as string | null;
      if (lb && lb !== props.uid) return; // locked by the other user
      const got = await tree.acquireLock(n.id);
      setHeldLabel(got ? n.label.split(" — ")[0] : null);
    },
  });

  onMount(async () => {
    // Clean slate: drop any lock left from a previous session (refresh loses client state).
    await tree.releaseAllLocks();
    setHeldLabel(null);
    const { count } = await props.client.from(TABLE).select("*", { count: "exact", head: true }).eq("kind", "leaf");
    setTotal(count ?? 0);
  });

  const held = () => tree.heldId();
  const bump = async (delta: number) => {
    const id = held();
    if (id) await props.client.rpc("bump_balance", { _id: id, _delta: delta });
  };
  const release = async () => {
    await tree.releaseLock();
    setHeldLabel(null);
  };

  return (
    <>
      <div style="font-size:13px;margin-bottom:8px">
        <div style="opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">
          {domRows()} in DOM / {total()} accounts · holding {heldLabel() ?? "nothing"}
        </div>
        <div style="display:flex;gap:6px">
          <button disabled={!held()} onClick={() => bump(100)}>+ $100</button>
          <button disabled={!held()} onClick={() => bump(-100)}>− $100</button>
          <button disabled={!held()} onClick={release}>release</button>
        </div>
      </div>
      <div style={`height:380px;border:2px solid ${props.accent};border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:${props.accent}22`}>
        <SupabaseTree
          tree={tree}
          onRangeChange={(start, end) => setDomRows(end - start + 1)}
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

export const SupabaseDemo: Component = () => {
  const configured = URL && ANON && !ANON.includes("paste-anon");
  return (
    <div style="font-family:system-ui;padding:16px;max-width:820px">
      <h2>&lt;SupabaseTree&gt; — collaborative on a REAL backend</h2>
      <p style="font-size:13px;color:#555">
        Two real Supabase auth sessions over a 3-level tree in <code>{TABLE}</code>
        (Region → Branch → Account), driven by <code>createSupabaseTreeController</code>.
        Expand a branch to <strong>lazy-load</strong> its children from Postgres; rows are
        windowed; Realtime + server-enforced locks (RLS + SECURITY DEFINER RPCs) are live.
        Click a leaf <em>account</em> to lock it (🔒 yours, 👤 theirs), ±$100 mutates
        Postgres, both views sync. Nothing here is faked.
      </p>
      <Show
        when={configured}
        fallback={
          <p style="color:#b91c1c;font-size:13px">
            Not configured. In <code>examples/</code>: <code>cp .env.example .env</code> and set
            <code>VITE_SUPABASE_ANON_KEY</code>; and run <code>npm run setup</code> in{" "}
            <code>supabase/</code> first.
          </p>
        }
      >
        <div style="display:flex;gap:16px">
          <Column
            email={import.meta.env.VITE_TEST_A_EMAIL as string}
            password={import.meta.env.VITE_TEST_A_PASS as string}
            name="Tim"
            accent="#2563eb"
          />
          <Column
            email={import.meta.env.VITE_TEST_B_EMAIL as string}
            password={import.meta.env.VITE_TEST_B_PASS as string}
            name="Sarah"
            accent="#db2777"
          />
        </div>
      </Show>
    </div>
  );
};
