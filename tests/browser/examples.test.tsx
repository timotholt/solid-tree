import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import type { Component } from "solid-js";
import axe from "axe-core";
import type { CheckHelpers, ExampleBefore, ExampleCheck, ExampleMeta } from "../../examples/src/example.js";

// PLAN P8: every gallery example is a browser test — it renders with no console errors
// (the global guard), passes axe, and passes its own scripted `check`.

interface ExampleModule {
  meta: ExampleMeta;
  default: Component;
  check?: ExampleCheck;
  before?: ExampleBefore;
}
const modules = import.meta.glob<ExampleModule>("../../examples/src/examples/*.tsx", { eager: true });

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
});

function helpers(root: HTMLElement): CheckHelpers {
  const find = (id: string, within: HTMLElement = root) =>
    within.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`);
  const resolve = (t: HTMLElement | string) => (typeof t === "string" ? (find(t) ?? (() => { throw new Error(`row "${t}" is not rendered`); })()) : t);
  const settle = async (ms = 0) => {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    await Promise.resolve();
    await frame();
    await frame();
  };
  return {
    row: (id, within) => resolve(find(id, within) ?? id),
    has: (id, within) => !!find(id, within),
    click: async (t, init) => {
      resolve(t).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
      await settle();
    },
    key: async (t, key, init) => {
      const el = resolve(t);
      el.focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
      await settle();
    },
    type: async (el, text) => {
      (el as HTMLInputElement).value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
    },
    settle,
    mockFetch: (route) => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const body = route(String(input instanceof Request ? input.url : input));
        return body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch;
    },
    expect,
  };
}

const entries = Object.entries(modules).sort(([, a], [, b]) => a.meta.order - b.meta.order);

describe("gallery examples", () => {
  it("are numbered uniquely and described", () => {
    const orders = entries.map(([, m]) => m.meta.order);
    expect(new Set(orders).size).toBe(orders.length);
    for (const [, m] of entries) expect(m.meta.description.length).toBeGreaterThan(20);
  });

  for (const [path, mod] of entries) {
    const name = path.split("/").pop();
    it(`${name}: renders, is accessible, and passes its check`, async () => {
      // Examples may log on purpose (console.info is allowed by the guard).
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const host = document.createElement("div");
      document.body.appendChild(host);
      const h = helpers(host);
      mod.before?.(h);
      render(() => <mod.default />, { container: host });
      await h.settle(20);
      if (mod.check) await mod.check(host, h);
      await h.settle();
      const result = await axe.run(host, { resultTypes: ["violations"] });
      expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
      infoSpy.mockRestore();
      host.remove();
    }, 20_000);
  }
});
