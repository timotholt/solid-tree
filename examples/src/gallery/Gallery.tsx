import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import { entries } from "./registry.js";
import { runChecks, type CheckResult } from "./runChecks.js";
import "@timotholt/solid-tree/theme.css";

const REPO = "https://github.com/timotholt/solid-tree/blob/main/examples/src/examples";

/** The example gallery: sidebar, live demo, source panel. Hash routing (#slug). */
export function Gallery() {
  const current = () => location.hash.slice(1) || entries[0]?.slug;
  const [slug, setSlug] = createSignal(current());
  const [showSource, setShowSource] = createSignal(false);
  const onHash = () => setSlug(current());
  onMount(() => window.addEventListener("hashchange", onHash));
  onCleanup(() => window.removeEventListener("hashchange", onHash));
  const entry = createMemo(() => entries.find((e) => e.slug === slug()) ?? entries[0]);
  const [results, setResults] = createSignal<CheckResult[]>([]);
  const [running, setRunning] = createSignal(false);
  const [paused, setPaused] = createSignal(false);
  const run = async () => {
    setResults([]);
    setRunning(true);
    await runChecks(entries, (r) => setResults((rs) => [...rs, r]), setPaused);
    setRunning(false);
  };
  const passed = () => results().filter((r) => r.ok).length;

  return (
    <div class="gallery">
      <nav class="gallery-nav" aria-label="Examples">
        <a class="gallery-brand" href="#">
          solid-tree
        </a>
        <ol>
          <For each={entries}>
            {(e) => (
              <li>
                <a href={`#${e.slug}`} aria-current={e.slug === entry()?.slug ? "page" : undefined}>
                  <span class="num">{String(e.meta.order).padStart(2, "0")}</span> {e.meta.title}
                </a>
              </li>
            )}
          </For>
        </ol>
        <section class="checks" aria-label="Self-test">
          <button type="button" onClick={run} disabled={running()}>
            {running() ? "Running checks…" : "Run all checks in this browser"}
          </button>
          <Show when={results().length}>
            <p role="status">
              {passed()}/{results().length} passed{running() ? "…" : ""}
              {paused() ? " (paused while this tab is in the background)" : ""}
            </p>
            <ul>
              <For each={results()}>
                {(r) => (
                  <li data-ok={r.ok ? "" : undefined} title={r.error}>
                    {r.ok ? "✓" : "✗"} {r.title} <span class="num">{Math.round(r.ms)} ms</span>
                    <Show when={r.error}>
                      <div class="check-error">{r.error}</div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <p class="muted">
            Each example's scripted check plus an axe accessibility scan, the same ones CI runs.
          </p>
        </section>
      </nav>
      <main class="gallery-main">
        <Show when={entry()} keyed>
          {(e) => (
            <article>
              <header>
                <h1>{e.meta.title}</h1>
                <p>{e.meta.description}</p>
                <Show when={e.meta.tags?.length}>
                  <ul class="tags">
                    <For each={e.meta.tags}>{(t) => <li>{t}</li>}</For>
                  </ul>
                </Show>
              </header>
              <section class="demo-live" aria-label="Live demo">
                <Dynamic component={e.Component} />
              </section>
              <div class="source-bar">
                <button type="button" aria-expanded={showSource()} onClick={() => setShowSource((v) => !v)}>
                  {showSource() ? "Hide source" : "View source"}
                </button>
                <a href={`${REPO}/${e.file}`}>{e.file} on GitHub</a>
              </div>
              <Show when={showSource()}>
                <pre class="source" tabIndex={0} aria-label={`Source of ${e.file}`}>
                  <code>{e.source}</code>
                </pre>
              </Show>
            </article>
          )}
        </Show>
      </main>
    </div>
  );
}
