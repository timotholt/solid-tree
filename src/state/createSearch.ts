import { createComputed, createMemo, createSignal, on, type Accessor } from "solid-js";
import { searchView, type FilterMode, type Matcher, type SearchView, type TreeIndex } from "../core/index.js";

export interface SearchOptions<T> {
  index: Accessor<TreeIndex<T>>;
  /** Controlled query (provided ⇒ controlled). */
  controlled?: Accessor<string | undefined | null>;
  matcher: Accessor<Matcher<T>>;
  mode: Accessor<FilterMode>;
}

export interface Search {
  query: Accessor<string>;
  setQuery(q: string): void;
  view: Accessor<SearchView | null>;
  /**
   * Ephemeral expansion layer (ANALYSIS A2): toggles made while searching land here,
   * never in the user's (persisted) expansion, and vanish when the search ends.
   */
  override(id: string): boolean | undefined;
  setOverride(id: string, open: boolean): void;
}

export function createSearch<T>(opts: SearchOptions<T>): Search {
  const [own, setOwn] = createSignal("");
  const query = () => (opts.controlled ? opts.controlled() ?? "" : own()).trim();
  const view = createMemo(() => searchView(opts.index(), query(), opts.matcher(), opts.mode()));

  const [overrides, setOverrides] = createSignal<ReadonlyMap<string, boolean>>(new Map());
  // Reset the layer whenever searching starts or stops.
  const active = createMemo(() => view() !== null);
  createComputed(on(active, () => setOverrides(new Map()), { defer: true }));

  return {
    query,
    setQuery: (q) => setOwn(q),
    view,
    override: (id) => (active() ? overrides().get(id) : undefined),
    setOverride: (id, open) => setOverrides((m) => new Map(m).set(id, open)),
  };
}
