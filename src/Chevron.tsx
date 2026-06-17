import { Component, JSX } from "solid-js";

export interface ChevronProps {
  expanded: boolean;
  onClick?: (e: MouseEvent) => void;
  style?: JSX.CSSProperties | string;
}

export const Chevron: Component<ChevronProps> = (props) => {
  return (
    <span
      onClick={props.onClick}
      style={{
        "font-size": "11px",
        color: "var(--text-muted)",
        width: "12px",
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
