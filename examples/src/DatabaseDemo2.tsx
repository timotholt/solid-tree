// Two-column collaborative demo (Database2): one shared in-memory "backend" with a
// pub/sub (stands in for Supabase realtime). Two <DatabaseTree> instances = two
// clients (Tim + Sarah). 40 branches × 50 accounts = 2000 nodes, lazy + windowed.
// Expand a branch, click an account to LOCK it (🔒 yours, 👤 Name for the other,
// who then can't select it). ±$100 mutates the shared backend → both views update
// live. Mount via /?database2.
import { createSignal, type Component } from "solid-js";
import { DatabaseTree } from "@timotholt/solid-tree/database";
import type { TreeSource, TreeNodeData } from "@timotholt/solid-tree/database";
import "@timotholt/solid-tree/theme.css";

interface Account {
  id: string;
  name: string;
  balance: number;
  lockedBy: string | null;
}

const delay = <T,>(make: () => T, ms = 400): Promise<T> =>
  new Promise((res) => setTimeout(() => res(make()), ms));

// The shared backend both columns talk to (the "database" + realtime).
function createBank() {
  const BRANCHES = 40;
  const PER = 50;
  const accounts = new Map<string, Account>();
  for (let b = 0; b < BRANCHES; b++) {
    for (let i = 0; i < PER; i++) {
      const id = `b${b}-a${i}`;
      accounts.set(id, {
        id,
        name: `Account ${String(b).padStart(2, "0")}-${String(i).padStart(4, "0")}`,
        balance: 0,
        lockedBy: null,
      });
    }
  }

  const listeners = new Set<(c: { type: "update"; node: TreeNodeData }) => void>();
  const acctNode = (a: Account): TreeNodeData => ({
    id: a.id,
    label: `${a.name} — $${a.balance.toFixed(2)}`,
    type: "account",
    payload: { leaf: true, lockedBy: a.lockedBy, balance: a.balance },
  });
  const emit = (a: Account) => listeners.forEach((fn) => fn({ type: "update", node: acctNode(a) }));

  const source: TreeSource = {
    // Roots = branch folders (expandable).
    getRoots: () =>
      delay(() =>
        Array.from({ length: BRANCHES }, (_, b): TreeNodeData => ({
          id: "b" + b,
          label: `Branch ${String(b).padStart(2, "0")}`,
          type: "branch",
          payload: {}, // expandable
        }))
      ),
    // A branch's accounts (lazy) — returns CURRENT balance + lock state.
    getChildren: (node) =>
      delay(() => [...accounts.values()].filter((a) => a.id.startsWith(node.id + "-a")).map(acctNode)),
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  return {
    source,
    // Only the lock holder may edit (authoritative — like an RLS-gated write).
    setBalance(id: string, delta: number, user: string) {
      const a = accounts.get(id);
      if (!a || a.lockedBy !== user) return;
      a.balance += delta;
      emit(a);
    },
    // Atomic acquire — refuses if held by someone else; releases the user's prior lock.
    lock(id: string, user: string) {
      const a = accounts.get(id);
      if (!a || (a.lockedBy && a.lockedBy !== user)) return;
      for (const x of accounts.values()) {
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
    // Release everything this user holds (move cursor away / explicit unlock).
    release(user: string) {
      for (const x of accounts.values()) {
        if (x.lockedBy === user) {
          x.lockedBy = null;
          emit(x);
        }
      }
    },
  };
}

type Bank = ReturnType<typeof createBank>;

const Column: Component<{ bank: Bank; user: string; accent: string }> = (props) => {
  const [cursor, setCursor] = createSignal<string | null>(null); // selected node (branch or account)
  const [held, setHeld] = createSignal<string | null>(null); // the account we currently lock
  const [domRows, setDomRows] = createSignal(0);
  const releaseAll = () => {
    props.bank.release(props.user);
    setHeld(null);
  };
  return (
    <div style="flex:1;min-width:300px">
      <h3 style={`margin:0 0 6px;color:${props.accent}`}>{props.user}'s view</h3>
      <div style="display:flex;gap:6px;margin-bottom:8px;font-size:13px;align-items:center">
        <span style="opacity:.7">{domRows()} in DOM · holding {held() ?? "nothing"}</span>
        <span style="flex:1" />
        <button disabled={!held()} onClick={() => held() && props.bank.setBalance(held()!, 100, props.user)}>
          + $100
        </button>
        <button disabled={!held()} onClick={() => held() && props.bank.setBalance(held()!, -100, props.user)}>
          − $100
        </button>
        <button disabled={!held()} onClick={releaseAll}>release</button>
      </div>
      <div style={`height:380px;border:2px solid ${props.accent};border-radius:8px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:${props.accent}22`}>
        <DatabaseTree
          source={props.bank.source}
          selectedId={cursor()}
          onRangeChange={(start, end) => setDomRows(end - start + 1)}
          onSelect={(n) => {
            // Branch (or any non-account): move the cursor there + RELEASE our lock.
            // (Moving the pointer off a record unlocks it — and you can rest on a
            // branch holding nothing.)
            if (!n.payload?.leaf) {
              setCursor(n.id);
              releaseAll();
              return;
            }
            const lb = n.payload?.lockedBy as string | null;
            if (lb && lb !== props.user) return; // locked by the other user → not selectable
            setCursor(n.id);
            setHeld(n.id);
            props.bank.lock(n.id, props.user); // selecting an account locks it (releases prior)
          }}
          renderActionNode={(n) => {
            if (!n.payload?.leaf) return null; // branches: no lock indicator
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
      <h2>&lt;DatabaseTree&gt; — collaborative (virtual + lock + live sync)</h2>
      <p style="font-size:13px;color:#555">
        40 branches × 50 accounts = 2000 nodes, lazy + windowed (each view keeps only
        ~25 in the DOM). Expand a branch, click an account to lock it (🔒 yours, 👤
        theirs — and they can't select it). ±$100 syncs live to both views. (Simulates
        Supabase realtime + record locking.)
      </p>
      <div style="display:flex;gap:16px">
        <Column bank={bank} user="Tim" accent="#2563eb" />
        <Column bank={bank} user="Sarah" accent="#db2777" />
      </div>
    </div>
  );
};
