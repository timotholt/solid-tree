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

  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let orderCol = "id";
    let asc = true;
    let from = 0;
    let to = Infinity;
    const q: any = {
      select: () => q,
      is: (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), q),
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
      order: (col: string, o: { ascending: boolean }) => ((orderCol = col), (asc = o.ascending), q),
      range: (a: number, b: number) => ((from = a), (to = b), q),
      then: (resolve: (v: unknown) => void) => {
        const data = rows
          .filter((r) => filters.every((f) => f(r)))
          .sort((x, y) => (x[orderCol] > y[orderCol] ? 1 : -1) * (asc ? 1 : -1))
          .slice(from, to + 1);
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
    },
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
    switchUser: (id: string) => (user = id),
    /** The user the (fake) server currently authenticates as. */
    get user() {
      return user;
    },
    get getUserCalls() {
      return getUserCalls;
    },
  };
}
