import { createRoot } from "solid-js";

/** Run `fn` inside a reactive root (effects flush at the end of createRoot); returns its value + dispose. */
export function inRoot<T>(fn: () => T): T & { dispose: () => void } {
  let dispose!: () => void;
  const value = createRoot((d) => {
    dispose = d;
    return fn();
  });
  return Object.assign(value as object, { dispose }) as T & { dispose: () => void };
}

/** Let queued microtasks and effects settle. */
export const flush = () => new Promise<void>((r) => setTimeout(r, 0));
