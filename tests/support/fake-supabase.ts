// Minimal fake of the supabase-js surface solid-tree uses: from().select().is/eq().order().range(),
// rpc(), auth.getUser(), channel().on().subscribe(), removeChannel(). Records everything.

type Row = Record<string, any>;

export function fakeSupabase(opts: { rows?: Row[]; user?: string } = {}) {
  let rows = opts.rows ?? [];
  let user = opts.user ?? "me";
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const rpcImpl = new Map<string, (args: any) => Promise<{ data: unknown; error: unknown }>>();
  const channels: { topic: string; handler?: (p: any) => void; removed: boolean }[] = [];
  let getUserCalls = 0;
  let queries = 0;
  let onPage: (() => void) | undefined;
  const authListeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();

  // Parse the keyset `or` filter solid-tree emits:
  //   col.gt."v",and(col.eq."v",id.gt."w")
  const parseOr = (expr: string) => {
    const m = /^(\w+)\.(gt|lt)\."((?:[^"\\]|\\.)*)",and\((\w+)\.eq\."((?:[^"\\]|\\.)*)",(\w+)\.(gt|lt)\."((?:[^"\\]|\\.)*)"\)$/.exec(expr);
    if (!m) throw new Error(`fake supabase: unsupported or() filter: ${expr}`);
    const un = (v: string) => v.replace(/\\(.)/g, "$1");
    const [, c1, op1, v1, c2, v2, c3, op3, v3] = m;
    const cmp = (a: unknown, op: string, b: string) => (op === "gt" ? String(a) > b : String(a) < b);
    return (r: Row) => cmp(r[c1], op1, un(v1)) || (String(r[c2]) === un(v2) && cmp(r[c3], op3, un(v3)));
  };

  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: [string, boolean][] = [];
    let from = 0;
    let to = Infinity;
    const q: any = {
      select: () => q,
      is: (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), q),
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
      gt: (col: string, v: unknown) => (filters.push((r) => String(r[col]) > String(v)), q),
      lt: (col: string, v: unknown) => (filters.push((r) => String(r[col]) < String(v)), q),
      or: (expr: string) => (filters.push(parseOr(expr)), q),
      order: (col: string, o: { ascending: boolean }) => (orders.push([col, o.ascending]), q),
      range: (a: number, b: number) => ((from = a), (to = b), q),
      limit: (n: number) => ((to = from + n - 1), q),
      then: (resolve: (v: unknown) => void) => {
        queries++;
        const data = rows
          .filter((r) => filters.every((f) => f(r)))
          .sort((x, y) => {
            for (const [col, asc] of orders) {
              const a = String(x[col]);
              const b = String(y[col]);
              if (a !== b) return (a > b ? 1 : -1) * (asc ? 1 : -1);
            }
            return 0;
          })
          .slice(from, to + 1);
        // Simulate concurrent writers between pages.
        onPage?.();
        resolve({ data, error: null, table });
      },
    };
    return q;
  };

  const client: any = {
    from: (table: string) => query(table),
    rpc: async (fn: string, args?: unknown) => {
      rpcCalls.push({ fn, args });
      const impl = rpcImpl.get(fn);
      return impl ? impl(args) : { data: null, error: null };
    },
    auth: {
      getUser: async () => {
        getUserCalls++;
        return { data: { user: { id: user } } };
      },
      getSession: async () => ({ data: { session: { access_token: `token-${user}`, user: { id: user } } } }),
      onAuthStateChange: (cb: (event: string, session: { user: { id: string } } | null) => void) => {
        authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
      },
    },
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "anon-key",
    channel: (topic: string) => {
      const ch = { topic, handler: undefined as any, removed: false };
      channels.push(ch);
      const api: any = {
        on: (_ev: string, _filter: unknown, handler: (p: any) => void) => ((ch.handler = handler), api),
        subscribe: () => api,
        __ch: ch,
      };
      return api;
    },
    removeChannel: async (api: any) => {
      api.__ch.removed = true;
    },
  };

  return {
    client,
    rpcCalls,
    channels,
    onRpc: (fn: string, impl: (args: any) => Promise<{ data: unknown; error: unknown }>) => rpcImpl.set(fn, impl),
    setRows: (r: Row[]) => (rows = r),
    /** Switch the authenticated user and fire onAuthStateChange like supabase-js does. */
    switchUser: (id: string) => {
      user = id;
      authListeners.forEach((cb) => cb("SIGNED_IN", { access_token: `token-${id}`, user: { id } } as never));
    },
    /** Run `fn` after each page query (simulates other writers mid-load). */
    betweenPages: (fn: () => void) => (onPage = fn),
    get queries() {
      return queries;
    },
    get authListenerCount() {
      return authListeners.size;
    },
    /** The user the (fake) server currently authenticates as. */
    get user() {
      return user;
    },
    get getUserCalls() {
      return getUserCalls;
    },
  };
}
