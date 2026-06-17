import { Component, JSX } from "solid-js";

// Self-contained default layer (single source of style literals for Chevron, so
// it works standalone too — they're declared on the span itself). Consumers
// override the un-suffixed token (--tree-chevron-*) on any ancestor.
const CHEVRON_DEFAULTS = {
  "--tree-chevron-size-default": "11px",
  "--tree-chevron-width-default": "12px",
  "--tree-chevron-color-default": "var(--text-muted)",
} satisfies JSX.CSSProperties;

const tok = (name: string) => `var(--tree-${name}, var(--tree-${name}-default))`;

export interface ChevronProps {
  expanded: boolean;
  onClick?: (e: MouseEvent) => void;
  style?: JSX.CSSProperties | string;
}

export const Chevron: Component<ChevronProps> = (props) => {
  return (
    <span
      class="solid-tree-chevron"
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
