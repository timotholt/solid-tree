import { render } from "solid-js/web";
import axe from "axe-core";
import type { CheckHelpers } from "../example.js";
import type { Entry } from "./registry.js";
import { miniExpect } from "./miniExpect.js";

export interface CheckResult {
  slug: string;
  title: string;
  ok: boolean;
  skipped?: boolean;
  ms: number;
  error?: string;
}

// Background tabs throttle (or pause) requestAnimationFrame; never let that stall a run.
const frame = () =>
  new Promise<void>((r) => {
    const t = setTimeout(r, 50);
    requestAnimationFrame(() => {
      clearTimeout(t);
      r();
    });
  });

function helpers(root: HTMLElement): CheckHelpers {
  const find = (id: string, within: HTMLElement = root) => within.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`);
  const resolve = (t: HTMLElement | string) => {
    if (typeof t !== "string") return t;
    const el = find(t);
    if (!el) throw new Error(`row "${t}" is not rendered`);
    return el;
  };
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
      window.fetch = (async (input: RequestInfo | URL) => {
        const body = route(String(input instanceof Request ? input.url : input));
        return body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch;
    },
    expect: miniExpect,
  };
}

/**
 * Run every example's check in THIS browser: mount it off-screen, run `before`, its
 * `check`, then axe (zero violations required). The same checks run in CI
 * (tests/browser/examples.test.tsx).
 */
/** Hidden tabs do not render (no animation frames), so checks would fail falsely: wait. */
const whenVisible = (onPause?: (paused: boolean) => void) =>
  document.visibilityState === "visible"
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        onPause?.(true);
        const on = () => {
          if (document.visibilityState !== "visible") return;
          document.removeEventListener("visibilitychange", on);
          onPause?.(false);
          resolve();
        };
        document.addEventListener("visibilitychange", on);
      });

export async function runChecks(entries: Entry[], onResult: (r: CheckResult) => void, onPause?: (paused: boolean) => void) {
  const realFetch = window.fetch;
  for (const e of entries) {
    if (!e.check) continue;
    await whenVisible(onPause);
    const host = document.createElement("div");
    host.setAttribute("data-check-arena", "");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;background:var(--panel);";
    document.body.appendChild(host);
    const h = helpers(host);
    const t0 = performance.now();
    let dispose: (() => void) | undefined;
    try {
      e.before?.(h);
      dispose = render(() => <e.Component />, host);
      await h.settle(20);
      await e.check(host, h);
      await h.settle();
      // heading-order depends on where the off-screen arena sits in the gallery page, not
      // on the example; CI checks it properly (examples.test.tsx renders under an <h1>).
      const result = await axe.run(host, { resultTypes: ["violations"], rules: { "heading-order": { enabled: false } } });
      if (result.violations.length) throw new Error(`axe: ${result.violations.map((v) => v.id).join(", ")}`);
      onResult({ slug: e.slug, title: e.meta.title, ok: true, ms: performance.now() - t0 });
    } catch (err) {
      const skipped = err instanceof Error && err.name === "CheckSkipped";
      onResult({ slug: e.slug, title: e.meta.title, ok: skipped, skipped, ms: performance.now() - t0, error: err instanceof Error ? err.message : String(err) });
    } finally {
      dispose?.();
      host.remove();
      window.fetch = realFetch;
    }
  }
}
