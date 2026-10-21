// A tiny `expect` with the matchers the example checks use, so the gallery can run them
// live in any visitor's browser without a test framework.

const show = (v: unknown) => {
  try {
    return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as never)[k], (b as never)[k]));
};

export class CheckFailure extends Error {
  name = "AssertionError";
}

export function miniExpect(actual: unknown) {
  const make = (negate: boolean) => {
    const assert = (pass: boolean, msg: string) => {
      if (pass === negate) throw new CheckFailure(negate ? `expected NOT: ${msg}` : `expected ${msg}`);
    };
    return {
      toBe: (e: unknown) => assert(Object.is(actual, e), `${show(actual)} to be ${show(e)}`),
      toEqual: (e: unknown) => assert(deepEqual(actual, e), `${show(actual)} to equal ${show(e)}`),
      toContain: (e: unknown) =>
        assert(
          typeof actual === "string" ? actual.includes(String(e)) : Array.isArray(actual) && actual.some((x) => deepEqual(x, e)),
          `${show(actual)} to contain ${show(e)}`
        ),
      toBeNull: () => assert(actual === null, `${show(actual)} to be null`),
      toBeTruthy: () => assert(!!actual, `${show(actual)} to be truthy`),
      toBeGreaterThan: (n: number) => assert((actual as number) > n, `${show(actual)} > ${n}`),
      toBeLessThan: (n: number) => assert((actual as number) < n, `${show(actual)} < ${n}`),
    };
  };
  return Object.assign(make(false), { not: make(true) });
}
