import type { Accessor } from "solid-js";

/** A value, or an accessor returning it. Lets options be plain values or reactive. */
export type MaybeAccessor<T> = T | Accessor<T>;

export const access = <T>(v: MaybeAccessor<T>): T => (typeof v === "function" ? (v as Accessor<T>)() : v);

/**
 * PLAN §2.4 — "controlled iff passed, decided once": an input is controlled when its key
 * is present on the options object at creation. Solid props only carry keys that were
 * actually written in JSX, and `splitProps`/`mergeProps` preserve them.
 */
export const isProvided = (obj: object, key: string) => key in obj;

/**
 * Forward `keys` from `src` as live getters, preserving key presence (so controlled-ness
 * survives) and reactivity (reads happen where the value is used — ANALYSIS G1).
 */
export function forward<T extends object, K extends keyof T>(src: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    if (!(k in src)) continue;
    Object.defineProperty(out, k, { enumerable: true, configurable: true, get: () => src[k] });
  }
  return out;
}
