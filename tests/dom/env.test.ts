import { describe, expect, it } from "vitest";
import { isServer } from "solid-js/web";
import { createRoot, createSignal, createMemo } from "solid-js";

describe("dom environment", () => {
  it("resolves the browser (reactive) build of Solid", () => {
    expect(isServer).toBe(false);
    createRoot((dispose) => {
      const [n, setN] = createSignal(1);
      const double = createMemo(() => n() * 2);
      setN(2);
      expect(double()).toBe(4);
      dispose();
    });
  });
});
