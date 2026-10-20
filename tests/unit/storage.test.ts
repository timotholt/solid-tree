import { describe, expect, it } from "vitest";
import { storage } from "../../src/storage.js";

// In the unit project there is no `window`: storage must be SSR-safe.
describe("storage without window", () => {
  it("returns the default and never throws", () => {
    expect(typeof window).toBe("undefined");
    expect(storage.get("k", { a: 1 })).toEqual({ a: 1 });
    expect(() => storage.set("k", 1)).not.toThrow();
    expect(() => storage.remove("k")).not.toThrow();
  });
});
