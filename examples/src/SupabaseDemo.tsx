// Two-column collaborative demo on a REAL Supabase backend (table scratch_lock_demo).
// Same UX as ?database2, but the "backend" is Postgres + Realtime + RLS-enforced
// SECURITY DEFINER lock RPCs (see ../../supabase/). Two real auth sessions (test
// users A and B). Click an account to LOCK it via acquire_lock; ±$100 calls
// bump_balance; realtime syncs both columns. Mount via /?supabase.
//
// Prereq: run `npm run setup` in ../../supabase (creates table + RPCs + users),
// then `cp .env.example .env` here and fill VITE_SUPABASE_ANON_KEY.
import { createSignal, onCleanup, onMount, Show, type Component } from "solid-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTree, createSupabaseLock } from "@timotholt/solid-tree/supabase";
import type { TreeNodeData } from "@timotholt/solid-tree/supabase";
import "@timotholt/solid-tree/theme.css";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TABLE = "scratch_lock_demo";

const toNode = (row: Record<string, any>): TreeNodeData => ({
  id: row.id,
  label: `${row.label} — $${Number(row.balance ?? 0).toFixed(2)}`,
  type: "account",
  payload: { leaf: true, lockedBy: row.locked_by as string | null },
});

const Column: Component<{ email: string; password: string; name: string; accent: string }> = (props) => {
  const client: SupabaseClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const [ready, setReady] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);
  const [uid, setUid] = createSignal<string | null>(null);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [held, setHeld] = createSignal<string | null>(null);
  const [heldLabel, setHeldLabel] = createSignal<string | null>(null);
  const [domRows, setDomRows] = createSignal(0);
  const [total, setTotal] = createSignal(0);

  const drop = () => {
    setHeld(null);
    setHeldLabel(null);
  };
  const lock = createSupabaseLock({
    client,
    onLockLost: (id) => {
      if (held() === id) drop();
    },
  });

  onMount(async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: props.email,
      password: props.password,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setUid(data.user?.id ?? null);
    setReady(true);

    const { count } = await client.from(TABLE).select("*", { count: "exact", head: true });
    setTotal(count ?? 0);

    // Side channel so the lock learns when our held row is expired/reassigned.
    const ch = client
      .channel(`observe:${props.name}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: TABLE }, (p: any) =>
        lock.observe({ id: p.new.id, locked_by: p.new.locked_by })
      )
      .subscribe();
    onCleanup(() => void client.removeChannel(ch));
  });
  onCleanup(() => lock.dispose());

  const bump = async (delta: number) => {
    const id = held();
    if (id) await client.rpc("bump_balance", { _id: id, _delta: delta });
  };
  const release = async () => {
    await lock.release();
    drop();
  };

  return (
    <div style="flex:1;min-width:300px">
      <h3 style={`margin:0 0 6px;color:${props.accent}`}>{props.name} (real Supabase)</h3>
      <Show when={err()}>
        <p style="color:#b91c1c;font-size:13px">sign-in failed: {err()} — did you run setup + set .env?</p>
      </Show>
      <div style="font-size:13px;margin-bottom:8px">
        <div style="opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">
          {domRows()} in DOM / {total()} total · holding {heldLabel() ?? "nothing"}
        </div>
        <div style="display:flex;gap:6px">
          <button disabled={!held()} onClick={() => bump(100)}>+ $100</button>
          <button disabled={!held()} onClick={() => bump(-100)}>− $100</button>
          <button disabled={!held()} onClick={release}>release</button>
        </div>
      </div>
      <div style={`height:380px;border:2px solid ${props.accent};border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:${props.accent}22`}>
        <Show when={ready()} fallback={<p style="padding:12px;font-size:13px;opacity:.6">signing in…</p>}>
          <SupabaseTree
            client={client}
            table={TABLE}
            toNode={toNode}
            selectedId={cursor()}
            onRangeChange={(start, end) => setDomRows(end - start + 1)}
            onSelect={async (n) => {
              const lb = n.payload?.lockedBy as string | null;
              if (lb && lb !== uid()) return; // locked by the other user → not selectable
              const got = await lock.acquire(n.id);
              setCursor(n.id);
              if (got) {
                setHeld(n.id);
                setHeldLabel(n.label.split(" — ")[0]); // "Account 0160", not the uuid
              } else {
                drop();
              }
            }}
            renderActionNode={(n) => {
              const lb = n.payload?.lockedBy as string | null;
              if (lb === uid()) return <span title="you hold the lock">🔒</span>;
              if (lb) return <span style="font-size:11px;color:#b45309">👤 locked</span>;
              return null;
            }}
          />
        </Show>
      </div>
    </div>
  );
};

export const SupabaseDemo: Component = () => {
  const configured = URL && ANON && !ANON.includes("paste-anon");
  return (
    <div style="font-family:system-ui;padding:16px;max-width:820px">
      <h2>&lt;SupabaseTree&gt; — collaborative on a REAL backend</h2>
      <p style="font-size:13px;color:#555">
        Two real Supabase auth sessions over table <code>{TABLE}</code>: lazy + windowed,
        live Realtime, and record locks enforced server-side (RLS + SECURITY DEFINER
        RPCs). Click an account to lock it (🔒 yours, 👤 theirs), ±$100 mutates Postgres,
        both views sync live. Same UX as the in-memory <em>Collaborative</em> demo — but
        nothing here is faked.
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
            name="Gf"
            accent="#db2777"
          />
        </div>
      </Show>
    </div>
  );
};
