import { Component, Show, JSX } from "solid-js";
import { Chevron } from "./Chevron.jsx";
import { tok } from "./tokens.js";
import { useTree } from "./context.js";
import { TreeNodeData } from "./types.js";

// Built-in highlight for the DEFAULT matcher path — wraps the matched substring
// of the label in <mark>. Skipped when a custom matcher or renderLabel is used
// (Tree can't know what a custom matcher matched on).
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

// A single row's interior (no child recursion) — shared by the recursive
// <Tree> (via TreeBranch) and, later, the flat <VirtualTree>.
export const TreeRow: Component<{ node: TreeNodeData; depth: number }> = (props) => {
  const ctx = useTree();

  if (props.node.isDivider) {
    return (
      <div
        class="solid-tree-divider"
        style={`height: ${tok("divider-height")}; background: ${tok("divider-color")}; margin: ${tok("divider-margin")} 0;`}
      />
    );
  }

  const isAction = () => props.node.variant === "action";
  const hasChildren = () => !!props.node.children && props.node.children.length > 0;
  const isExpanded = () => ctx.expanded()[props.node.id] || false;
  const isSelected = () => ctx.selectedId() === props.node.id;
  const dimmed = () => ctx.isDimmed(props.node.id);

  const handleToggle = (e: Event) => {
    e.stopPropagation();
    ctx.onToggle(props.node.id);
  };

  return (
    <div
      class="solid-tree-row"
      data-depth={props.depth}
      data-variant={props.node.variant ?? "default"}
      data-selected={isSelected() ? "" : undefined}
      data-has-children={hasChildren() ? "" : undefined}
      data-dimmed={dimmed() ? "" : undefined}
      onClick={(e) => {
        // Tree-row click semantics (match VS Code / Finder):
        //   - unexpanded           → select + expand
        //   - expanded, unselected → select only (don't collapse)
        //   - expanded, selected   → toggle (collapse)
        // The chevron itself always toggles via its own handler, so
        // users can still collapse without selecting.
        const wasSelected = isSelected();
        const wasExpanded = isExpanded();
        ctx.onSelect(props.node);
        if (hasChildren()) {
          if (!wasExpanded) handleToggle(e);
          else if (wasSelected) handleToggle(e);
        }
      }}
      style={{
        display: "flex",
        "align-items": tok("row-align-items") as JSX.CSSProperties["align-items"],
        "--tree-depth": String(props.depth),
        "padding-left": isAction()
          ? "0"
          : `calc(${tok("indent-base")} + var(--tree-depth) * ${tok("indent-step")})`,
        "justify-content": isAction() ? "center" : "flex-start",
        opacity: isAction() ? tok("action-opacity") : dimmed() ? tok("dim-opacity") : "1",
        "font-size": tok("font-size"),
        "user-select": tok("user-select") as JSX.CSSProperties["user-select"],
        "-webkit-user-select": tok("user-select") as JSX.CSSProperties["-webkit-user-select"],
        cursor: "pointer",
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
        <Show when={hasChildren() && !isAction()}>
          <Chevron
            expanded={isExpanded()}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle(e);
            }}
            style={{ "margin-right": tok("chevron-gap") }}
          />
        </Show>
        <Show when={!hasChildren() && !isAction()}>
          <span class="solid-tree-spacer" style={`display:inline-block; width:${tok("spacer-width")};`} />
        </Show>

        <Show when={props.node.iconLeft}>
          <span class="solid-tree-icon-left" style={`flex-shrink: 0; margin-right: ${tok("icon-left-gap")};`}>
            {props.node.iconLeft}
          </span>
        </Show>

        <span
          class="solid-tree-label"
          style={`flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: ${tok("label-white-space")}; display: flex; align-items: center; ${props.depth === 0 && hasChildren() ? `font-weight:${tok("group-weight")};` : ""}`}
        >
          <span style={`overflow: hidden; text-overflow: ellipsis; white-space: ${tok("label-white-space")};`}>
            <Show
              when={ctx.renderLabel}
              fallback={<HighlightedLabel label={props.node.label} query={ctx.highlightQuery()} />}
            >
              {ctx.renderLabel!(props.node)}
            </Show>
          </span>
          <Show when={props.node.count !== undefined}>
            <span
              class="solid-tree-count"
              style={`opacity: ${tok("count-opacity")}; margin-left: ${tok("count-gap")}; font-weight: ${tok("count-weight")}; flex-shrink: 0;`}
            >
              ({props.node.count})
            </span>
          </Show>
        </span>
        <Show when={props.node.iconRight}>
          <span
            class="solid-tree-icon-right"
            style={`margin-left: ${tok("icon-right-gap")}; flex-shrink: 0; font-size: ${tok("icon-right-size")};`}
          >
            {props.node.iconRight}
          </span>
        </Show>
      </div>

      <Show when={ctx.renderActionNode}>
        <div
          class="solid-tree-action"
          style={`display:flex; align-items:center; margin-left:${tok("action-gap")};`}
          onClick={(e) => e.stopPropagation()}
        >
          {ctx.renderActionNode!(props.node)}
        </div>
      </Show>
    </div>
  );
};
