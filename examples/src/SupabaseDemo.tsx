// Two-column collaborative demo on a REAL Supabase backend (table scratch_lock_demo).
// Driven by createSupabaseTreeController: the controller owns the source/cache/lazy/
// realtime AND the record lock; the demo just calls controller.acquireLock / releaseLock
// / heldId and renders <SupabaseTree tree={controller}/>. Two real auth sessions.
// Mount via /?supabase.
//
// Prereq: run `npm run setup` in ../../supabase (creates table + RPCs + users),
// then `cp .env.example .env` here and fill VITE_SUPABASE_ANON_KEY.
import { createSignal, onMount, Show, type Component } from "solid-js";
import { type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTree, createSupabaseTreeController } from "@timotholt/solid-tree/supabase";
import type { TreeNodeData } from "@timotholt/solid-tree/supabase";
import { AuthColumn, lockBadge, sbConfigured, TEST_USERS, NotConfigured } from "./sb.jsx";
import "@timotholt/solid-tree/theme.css";

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

// Built post-auth (by AuthColumn) so the roots query runs authenticated under RLS.
const ColumnInner: Component<{ client: SupabaseClient; uid: string; accent: string }> = (props) => {
  const [heldLabel, setHeldLabel] = createSignal<string | null>(null);
  const [domRows, setDomRows] = createSignal(0);
  const [total, setTotal] = createSignal(0);

  const tree = createSupabaseTreeController({
    client: props.client,
    table: TABLE,
    toNode,
    parentColumn: "parent_id",
    orderBy: { column: "label" },
    onLockLost: () => setHeldLabel(null),
    canSelect: (n) => {
      const lb = n.payload?.lockedBy as string | null;
      return !(lb && lb !== props.uid); // can't select an account another user holds
    },
    onSelect: async (n) => {
      // Groups aren't lockable — release whatever we held. (Expand = chevron, not select.)
      if (!n.payload?.leaf) {
        setHeldLabel(null);
        await tree.releaseLock();
        return;
      }
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
          renderActionNode={(n) => lockBadge(n.payload?.lockedBy as string | null, props.uid)}
        />
      </div>
    </>
  );
};

export const SupabaseDemo: Component = () => (
  <div style="font-family:system-ui;padding:16px;max-width:820px">
    <h2>&lt;SupabaseTree&gt; — collaborative on a REAL backend</h2>
    <p style="font-size:13px;color:#555">
      Two real Supabase auth sessions over a 3-level tree in <code>{TABLE}</code>
      (Region → Branch → Account), driven by <code>createSupabaseTreeController</code>. Expand a
      branch to <strong>lazy-load</strong> its children from Postgres; rows are windowed; Realtime +
      server-enforced locks (RLS + SECURITY DEFINER RPCs) are live. Click a leaf <em>account</em> to
      lock it (🔒 yours, 👤 theirs), ±$100 mutates Postgres, both views sync. Nothing here is faked.
    </p>
    <Show when={sbConfigured} fallback={<NotConfigured />}>
      <div style="display:flex;gap:16px">
        {TEST_USERS.map((u) => (
          <AuthColumn prefix="bank" email={u.email} password={u.password} name={u.name} accent={u.accent}>
            {(client, uid) => <ColumnInner client={client} uid={uid} accent={u.accent} />}
          </AuthColumn>
        ))}
      </div>
    </Show>
  </div>
);
