import { test } from "vitest";

/**
 * A test that documents a ledger defect (docs/ANALYSIS.md) by asserting the CORRECT
 * behavior. It passes only while the defect exists, i.e. while `fn` fails with an
 * assertion error:
 *   - fn fails with an AssertionError → the defect is still present → pass.
 *   - fn throws anything else          → broken fixture, not the defect → fail.
 *   - fn passes                        → defect fixed → fail, telling you to convert it
 *                                        to a `regression(<id>)` test (PLAN §5.3).
 */
export function knownDefect(id: string, title: string, fn: () => unknown | Promise<unknown>, timeout?: number) {
  test(`knownDefect(${id}): ${title}`, async () => {
    try {
      await fn();
    } catch (error) {
      if (isAssertionError(error)) return;
      throw new Error(`knownDefect(${id}) threw a non-assertion error — broken fixture? ${String(error)}`, {
        cause: error,
      });
    }
    throw new Error(`${id} appears fixed — convert this to a regression(${id}) test`);
  }, timeout);
}

function isAssertionError(error: unknown): boolean {
  return error instanceof Error && error.name === "AssertionError";
}
