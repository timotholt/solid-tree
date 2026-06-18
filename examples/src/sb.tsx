// Shared Supabase helpers for the collaborative demos (?supabase, ?outline). Dedups the
// env config, per-column client creation, sign-in shell, lock badge, and not-configured
// notice that both demos otherwise hand-roll.
import { createSignal, onMount, Show, type Component, type JSX } from "solid-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const sbConfigured = !!SB_URL && !!SB_ANON && !SB_ANON.includes("paste-anon");

/** The two throwaway test users `npm run setup` creates. */
export const TEST_USERS = [
  { email: import.meta.env.VITE_TEST_A_EMAIL as string, password: import.meta.env.VITE_TEST_A_PASS as string, name: "Tim", accent: "#2563eb" },
  { email: import.meta.env.VITE_TEST_B_EMAIL as string, password: import.meta.env.VITE_TEST_B_PASS as string, name: "Sarah", accent: "#db2777" },
];

/** Distinct storageKey per client so two columns' auth sessions don't collide. */
export const makeClient = (key: string): SupabaseClient =>
  createClient(SB_URL, SB_ANON, {
    auth: { persistSession: false, autoRefreshToken: true, storageKey: `sb-${key}` },
  });

/**
 * Sign-in shell: makes a client (isolated session), signs in, then renders
 * `children(client, uid)` once authed. The collab demos wrap their per-column UI in this.
 */
export const AuthColumn: Component<{
  prefix: string;
  email: string;
  password: string;
  name: string;
  accent: string;
  children: (client: SupabaseClient, uid: string) => JSX.Element;
}> = (props) => {
  const client = makeClient(`${props.prefix}-${props.name}`);
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
        <p style="color:#b91c1c;font-size:13px">sign-in failed: {err()} — did you run setup + set .env?</p>
      </Show>
      <Show when={ready()} fallback={<p style="font-size:13px;opacity:.6">signing in…</p>}>
        {() => props.children(client, uid()!)}
      </Show>
    </div>
  );
};

/** Lock indicator: 🔒 if you hold it, 👤 if someone else does, nothing if free. */
export const lockBadge = (lockedBy: string | null | undefined, uid: string): JSX.Element => {
  if (lockedBy === uid) return <span title="you hold the lock">🔒</span>;
  if (lockedBy) return <span style="font-size:11px;color:#b45309">👤 locked</span>;
  return null;
};

export const NotConfigured: Component = () => (
  <p style="color:#b91c1c;font-size:13px">
    Not configured. In <code>examples/</code>: <code>cp .env.example .env</code> and set
    <code> VITE_SUPABASE_ANON_KEY</code>, and run <code>npm run setup</code> in <code>supabase/</code>.
  </p>
);
