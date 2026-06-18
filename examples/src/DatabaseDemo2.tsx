// Two-column collaborative demo (Database2): one shared in-memory "backend" with a
// pub/sub (stands in for Supabase realtime). Two <DatabaseTree> instances = two
// clients (Tim + Gf). Selecting an account LOCKS it (🔒 for you, 👤 Name for the
// other, who then can't select it). ±$100 mutates the shared backend → both views
// update live. Mount via /?database2.
import { createSignal, type Component } from "solid-js";
import { DatabaseTree } from "@timotholt/solid-tree/database";
import type { TreeSource, TreeNodeData, TreeChange } from "@timotholt/solid-tree/database";
import "@timotholt/solid-tree/theme.css";

interface Account {
  id: string;
  name: string;
  balance: number;
  lockedBy: string | null;
}

// The shared backend both columns talk to (the "database" + realtime).
function createBank() {
  const accounts: Account[] = Array.from({ length: 14 }, (_, i) => ({
    id: "a" + i,
    name: `Bank Account ${String(i + 1).padStart(4, "0")}`,
    balance: 0,
    lockedBy: null,
  }));
  const listeners = new Set<(c: TreeChange) => void>();

  const toNode = (a: Account): TreeNodeData => ({
    id: a.id,
    label: `${a.name} — $${a.balance.toFixed(2)}`,
    type: "account",
    payload: { leaf: true, lockedBy: a.lockedBy, balance: a.balance },
  });
  const emit = (a: Account) => listeners.forEach((fn) => fn({ type: "update", node: toNode(a) }));

  const source: TreeSource = {
    getRoots: () => Promise.resolve(accounts.map(toNode)),
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  return {
    source,
    // Only the lock holder may edit (authoritative — like an RLS-gated write).
    setBalance(id: string, delta: number, user: string) {
      const a = accounts.find((x) => x.id === id);
      if (!a || a.lockedBy !== user) return;
      a.balance += delta;
      emit(a);
    },
    // Acquire `id` for `user`, releasing any other account that user held. REFUSES
    // if already held by someone else (atomic acquire — can't steal a lock).
    lock(id: string, user: string) {
      const a = accounts.find((x) => x.id === id);
      if (!a || (a.lockedBy && a.lockedBy !== user)) return; // held by other → refuse
      for (const x of accounts) {
        if (x.lockedBy === user && x.id !== id) {
          x.lockedBy = null;
          emit(x);
        }
      }
      if (a.lockedBy !== user) {
        a.lockedBy = user;
        emit(a);
      }
    },
  };
}

type Bank = ReturnType<typeof createBank>;

const Column: Component<{ bank: Bank; user: string; other: string; accent: string }> = (props) => {
  const [cursor, setCursor] = createSignal<string | null>(null);
  return (
    <div style="flex:1;min-width:300px">
      <h3 style={`margin:0 0 6px;color:${props.accent}`}>{props.user}'s view</h3>
      <div style="display:flex;gap:6px;margin-bottom:8px;font-size:13px;align-items:center">
        <span style="opacity:.7">selected: {cursor() ?? "(none)"}</span>
        <span style="flex:1" />
        <button disabled={!cursor()} onClick={() => cursor() && props.bank.setBalance(cursor()!, 100, props.user)}>
          + $100
        </button>
        <button disabled={!cursor()} onClick={() => cursor() && props.bank.setBalance(cursor()!, -100, props.user)}>
          − $100
        </button>
      </div>
      <div style={`height:380px;border:2px solid ${props.accent};border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:${props.accent}22`}>
        <DatabaseTree
          source={props.bank.source}
          selectedId={cursor()}
          onSelect={(n) => {
            const lb = n.payload?.lockedBy as string | null;
            if (lb && lb !== props.user) return; // locked by the other user → not selectable
            setCursor(n.id);
            props.bank.lock(n.id, props.user); // moving the cursor locks the record
          }}
          renderActionNode={(n) => {
            const lb = n.payload?.lockedBy as string | null;
            if (lb === props.user) return <span title="you hold the lock">🔒</span>;
            if (lb) return <span style="font-size:11px;color:#b45309">👤 {lb}</span>;
            return null;
          }}
        />
      </div>
    </div>
  );
};

export const DatabaseDemo2: Component = () => {
  const bank = createBank();
  return (
    <div style="font-family:system-ui;padding:16px;max-width:820px">
      <h2>&lt;DatabaseTree&gt; — collaborative (lock + live sync)</h2>
      <p style="font-size:13px;color:#555">
        One shared backend, two clients. Click an account to lock it (🔒 yours, 👤 theirs —
        and they can't select it). ±$100 syncs live to both views. (Simulates Supabase
        realtime + record locking.)
      </p>
      <div style="display:flex;gap:16px">
        <Column bank={bank} user="Tim" other="Gf" accent="#2563eb" />
        <Column bank={bank} user="Gf" other="Tim" accent="#db2777" />
      </div>
    </div>
  );
};
