import { type Component, type JSX } from "solid-js";

/**
 * Side-by-side demo card: live component on the left, the exact source that
 * produced it on the right. Used by every example so the gallery doubles as
 * copy-pasteable docs.
 */
export const Demo: Component<{
  title: string;
  blurb: string;
  code: string;
  children: JSX.Element;
}> = (props) => {
  return (
    <section class="demo">
      <header>
        <h2>{props.title}</h2>
        <p>{props.blurb}</p>
      </header>
      <div class="demo-body">
        <div class="demo-live">{props.children}</div>
        <pre class="demo-code">
          <code>{props.code.trim()}</code>
        </pre>
      </div>
    </section>
  );
};
