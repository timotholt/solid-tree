import { Component, JSX } from "solid-js";

// Self-contained default layer (single source of style literals for Chevron, so
// it works standalone too — they're declared on the span itself). Consumers
// override the un-suffixed token (--tree-chevron-*) on any ancestor.
// em-relative so the chevron scales with --tree-font-size (the row's font, which
// is this span's parent font). Defaults equal the old 11px/12px at the 12px anchor.
const CHEVRON_DEFAULTS = {
  "--tree-chevron-size-default": "0.92em",
  "--tree-chevron-width-default": "1.1em",
  "--tree-chevron-color-default": "var(--text-muted)",
} satisfies JSX.CSSProperties;

const tok = (name: string) => `var(--tree-${name}, var(--tree-${name}-default))`;

export interface ChevronProps {
  expanded: boolean;
  /** Hide the glyph when its owning treeitem already exposes aria-expanded. */
  ariaHidden?: boolean;
  onClick?: (e: MouseEvent) => void;
  style?: JSX.CSSProperties | string;
}

export const Chevron: Component<ChevronProps> = (props) => {
  return (
    <span
      class="solid-tree-chevron"
      aria-hidden={props.ariaHidden ? "true" : undefined}
      onClick={props.onClick}
      style={{
        ...CHEVRON_DEFAULTS,
        "font-size": tok("chevron-size"),
        color: tok("chevron-color"),
        width: tok("chevron-width"),
        display: "inline-block",
        cursor: "pointer",
        "flex-shrink": "0",
        "user-select": "none",
        ...(typeof props.style === "object" ? props.style : {}),
      }}
    >
      {props.expanded ? "▼" : "▶"}
    </span>
  );
};
