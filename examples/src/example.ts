// The contract every gallery example follows. One file per example in ./examples/:
//   export const meta: ExampleMeta
//   export default function Example(): JSX.Element
//   export const check: ExampleCheck   (optional — scripted assertions, run as a browser test)
//   export const before: ExampleBefore (optional — test-only setup before render, e.g. mockFetch)
//
// The gallery discovers examples with import.meta.glob, so adding one never touches a
// shared list. Every example is also a test (tests/browser/examples.test.tsx): it must
// render without console errors, pass axe, and pass its own `check`.

export interface ExampleMeta {
  /** Sort key and URL slug prefix, e.g. 1 → #01-quick-start. */
  order: number;
  title: string;
  /** One or two sentences: what this example teaches. */
  description: string;
  /** Feature tags shown in the sidebar. */
  tags?: string[];
}

/** Helpers handed to `check` (so examples never import a test framework). */
export interface CheckHelpers {
  /** The treeitem element for a node id (throws if not rendered). */
  row(id: string, within?: HTMLElement): HTMLElement;
  /** Whether a node id is currently rendered. */
  has(id: string, within?: HTMLElement): boolean;
  click(target: HTMLElement | string, init?: MouseEventInit): Promise<void>;
  key(target: HTMLElement | string, key: string, init?: KeyboardEventInit): Promise<void>;
  /** Type into an input/textarea (replaces its value) and fire input events. */
  type(target: HTMLElement, text: string): Promise<void>;
  /** Let Solid, timers and two animation frames settle. */
  settle(ms?: number): Promise<void>;
  /** Replace fetch for the rest of this check: route(url) → JSON body (or Response). */
  mockFetch(route: (url: string) => unknown): void;
  /** Vitest's expect. */
  expect: (value: unknown) => any;
}

export type ExampleCheck = (root: HTMLElement, h: CheckHelpers) => Promise<void>;

/**
 * Optional `export const before: ExampleBefore` — runs in the test BEFORE the example
 * renders, e.g. to install h.mockFetch for an example that fetches on mount.
 */
export type ExampleBefore = (h: CheckHelpers) => void;

/**
 * Throw from a `check` when the environment, not the code, prevents running it (e.g. a
 * large download on a slow connection). The live gallery shows it as skipped; CI fails.
 */
export class CheckSkipped extends Error {
  name = "CheckSkipped";
}
