import { Component, Match, Show, Switch, createMemo, onCleanup, type JSX, type Accessor } from "solid-js";
import { Chevron } from "./Chevron.js";
import { tok } from "./tokens.js";
import { useTree } from "./context.js";
import type { FlatRow } from "../types.js";

// Built-in highlight for the DEFAULT matcher path — wraps the matched substring of the
// label in <mark>. Skipped when a custom matcher or renderLabel is used (the tree can't
// know what a custom matcher matched on).
const HighlightedLabel: Component<{ label: string; query: string | null }> = (props) => (
  <Show when={props.query} fallback={<>{props.label}</>}>
    {(() => {
      const label = props.label;
      const q = props.query!.toLowerCase();
      const i = label.toLowerCase().indexOf(q);
      if (i < 0 || q.length === 0) return <>{label}</>;
      return (
        <>
          {label.slice(0, i)}
          <mark class="solid-tree-mark">{label.slice(i, i + q.length)}</mark>
          {label.slice(i + q.length)}
        </>
      );
    })()}
  </Show>
);

/**
 * One visible row, rendered from a flat-row accessor. The row's KIND is reactive, so a
 * reused virtual slot switches correctly between node, separator and placeholder
 * (ANALYSIS B1).
 *
 * Markup: a `role="none"` wrapper holding the treeitem. The actions slot lives inside the
 * treeitem (a tree may only own treeitems), hidden from assistive tech and out of the tab
 * order: actions are pointer shortcuts, and the app must offer the same commands by
 * keyboard (onKeyDown, onActivate, a menu). See docs/ACCESSIBILITY.md (ANALYSIS G6).
 */
export const TreeRow: Component<{ row: Accessor<FlatRow | undefined> }> = (props) => {
  return (
    <Show when={props.row()}>
      {(row) => (
        <Switch>
          <Match when={row().kind === "separator"}>
            <div
              class="solid-tree-divider"
              role="none"
              aria-hidden="true"
              style={`height: ${tok("divider-height")}; background: ${tok("divider-color")}; margin: ${tok("divider-margin")} 0;`}
            />
          </Match>
          <Match when={row().kind === "placeholder"}>
            <PlaceholderRow row={row} />
          </Match>
          <Match when={row().kind === "node"}>
            <NodeRow row={row} />
          </Match>
        </Switch>
      )}
    </Show>
  );
};

/** Keep everything inside the (aria-hidden) actions slot out of the tab order. */
const FOCUSABLE = "a[href],button,input,select,textarea,[tabindex]";
function untabbable(el: HTMLElement) {
  const apply = () => el.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((f) => f.setAttribute("tabindex", "-1"));
  queueMicrotask(apply);
  if (typeof MutationObserver !== "undefined") {
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    onCleanup(() => mo.disconnect());
  }
}

const indent = (isAction: boolean) =>
  isAction ? "0" : `calc(${tok("indent-base")} + var(--tree-depth) * ${tok("indent-step")})`;

const PlaceholderRow: Component<{ row: Accessor<FlatRow> }> = (props) => {
  const ctx = useTree();
  const isError = () => props.row().placeholder === "error";
  return (
    <div class="solid-tree-row" role="none" data-placeholder={props.row().placeholder} style={{ display: "flex", "--tree-depth": String(props.row().depth) }}>
      <div
        class="solid-tree-item"
        {...ctx.view.getItemProps(props.row)}
        style={{
          display: "flex",
          flex: "1",
          "align-items": "center",
          "padding-left": `calc(${indent(false)} + ${tok("spacer-width")})`,
          "font-size": tok("font-size"),
          cursor: isError() ? "pointer" : "default",
        }}
      >
        <Show
          when={ctx.renderLabel}
          fallback={
            <span class={isError() ? "solid-tree-error" : "solid-tree-loading"} style="opacity:.6;font-style:italic">
              {isError() ? "Failed to load — click to retry" : props.row().node.label}
            </span>
          }
        >
          {ctx.renderLabel!(props.row().node)}
        </Show>
      </div>
    </div>
  );
};

const NodeRow: Component<{ row: Accessor<FlatRow> }> = (props) => {
  const ctx = useTree();
  const r = props.row;
  // Rows are rebuilt on every flatten; memoizing the node keeps label renders (and any
  // component the consumer renders in a slot) from re-running when only the row object
  // changed (ANALYSIS G2).
  const node = createMemo(() => r().node);
  const isAction = () => node().variant === "action";
  const dimmed = () => ctx.tree.isDimmed(r().id);
  const selected = () => ctx.tree.selectedIds().has(r().id);

  return (
    <div
      class="solid-tree-row"
      role="none"
      data-depth={r().depth}
      data-variant={node().variant ?? "default"}
      data-selected={selected() ? "" : undefined}
      data-has-children={r().hasChildren ? "" : undefined}
      data-dimmed={dimmed() ? "" : undefined}
      data-disabled={node().disabled ? "" : undefined}
      style={{
        display: "flex",
        "align-items": tok("row-align-items") as JSX.CSSProperties["align-items"],
        "--tree-depth": String(r().depth),
        opacity: isAction() ? tok("action-opacity") : dimmed() ? tok("dim-opacity") : node().disabled ? tok("dim-opacity") : "1",
      }}
    >
      <div
        class="solid-tree-item"
        {...ctx.view.getItemProps(r)}
        data-depth={r().depth}
        data-variant={node().variant ?? "default"}
        data-has-children={r().hasChildren ? "" : undefined}
        data-dimmed={dimmed() ? "" : undefined}
        style={{
          display: "flex",
          flex: isAction() ? "initial" : "1",
          "min-width": "0",
          margin: isAction() ? "0 auto" : undefined,
          "align-items": tok("row-align-items") as JSX.CSSProperties["align-items"],
          "padding-left": indent(isAction()),
          "justify-content": isAction() ? "center" : "flex-start",
          "font-size": tok("font-size"),
          "user-select": tok("user-select") as JSX.CSSProperties["user-select"],
          "-webkit-user-select": tok("user-select") as JSX.CSSProperties["-webkit-user-select"],
          cursor: node().disabled ? "default" : "pointer",
        }}
      >
        <div
          class="solid-tree-row-content"
          style={{
            display: "flex",
            "align-items": tok("row-align-items") as JSX.CSSProperties["align-items"],
            flex: isAction() ? "initial" : "1",
            overflow: "hidden",
          }}
        >
          <Show when={r().hasChildren && !isAction()}>
            <Chevron expanded={r().expanded} ariaHidden onClick={ctx.view.getToggleProps(r).onClick as (e: MouseEvent) => void} style={{ "margin-right": tok("chevron-gap") }} />
          </Show>
          <Show when={!r().hasChildren && !isAction()}>
            <span class="solid-tree-spacer" style={`display:inline-block; width:${tok("spacer-width")};`} />
          </Show>

          <Show when={ctx.renderLeading}>{ctx.renderLeading!(r())}</Show>

          <Show when={node().iconLeft}>
            <span class="solid-tree-icon-left" style={`flex-shrink: 0; margin-right: ${tok("icon-left-gap")};`}>
              {node().iconLeft}
            </span>
          </Show>

          <span
            class="solid-tree-label"
            style={`flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: ${tok("label-white-space")}; display: flex; align-items: center; ${r().depth === 0 && r().hasChildren ? `font-weight:${tok("group-weight")};` : ""}`}
          >
            <span style={`overflow: hidden; text-overflow: ellipsis; white-space: ${tok("label-white-space")};`}>
              <Show when={ctx.renderLabel} fallback={<HighlightedLabel label={node().label} query={ctx.tree.highlightQuery()} />}>
                {ctx.renderLabel!(node())}
              </Show>
            </span>
            <Show when={node().count !== undefined}>
              <span
                class="solid-tree-count"
                style={`opacity: ${tok("count-opacity")}; margin-left: ${tok("count-gap")}; font-weight: ${tok("count-weight")}; flex-shrink: 0;`}
              >
                ({node().count})
              </span>
            </Show>
          </span>
          <Show when={node().iconRight}>
            <span class="solid-tree-icon-right" style={`margin-left: ${tok("icon-right-gap")}; flex-shrink: 0; font-size: ${tok("icon-right-size")};`}>
              {node().iconRight}
            </span>
          </Show>
        </div>
        <Show when={ctx.renderActionNode}>
          <div
            class="solid-tree-action"
            aria-hidden="true"
            ref={untabbable}
            style={`display:flex; align-items:center; margin-left:${tok("action-gap")};`}
            onClick={(e) => e.stopPropagation()}
          >
            {ctx.renderActionNode!(node())}
          </div>
        </Show>
      </div>

    </div>
  );
};
