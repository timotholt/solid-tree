import { JSX } from "solid-js";

// ── Style defaults ───────────────────────────────────────────────────────────
// The ONLY place style literals live. Each is published on the container as
// `--tree-<name>-default`; component styles read `tok(name)` =
// `var(--tree-<name>, var(--tree-<name>-default))`. So consumers override the
// un-suffixed token on the container or any ancestor (no specificity fight),
// while these stay the single source of truth — no magic numbers in the markup.
// --tree-font-size is the master scale anchor (px). All spatial/text metrics are
// `em` relative to it, so overriding --tree-font-size proportionally resizes the
// whole tree. (em defaults chosen to equal the old px values at the 12px anchor.)
// Exceptions kept in px: the divider hairline + its margin (a divider has no
// font context — em there would resolve against the page font, not the tree's).
export const STYLE_DEFAULTS = {
  "--tree-font-size-default": "12px",
  "--tree-indent-base-default": "1em",
  "--tree-indent-step-default": "1em",
  "--tree-group-weight-default": "700",
  "--tree-count-opacity-default": "0.5",
  "--tree-count-gap-default": "0.33em",
  "--tree-count-weight-default": "400",
  "--tree-icon-left-gap-default": "0",
  "--tree-icon-right-gap-default": "0.5em",
  "--tree-icon-right-size-default": "0.92em",
  "--tree-chevron-gap-default": "0.33em",
  "--tree-action-gap-default": "0.67em",
  "--tree-action-opacity-default": "0.6",
  "--tree-dim-opacity-default": "0.38",
  "--tree-divider-color-default": "var(--border-subtle)",
  "--tree-divider-margin-default": "8px",
  "--tree-divider-height-default": "1px",
  "--tree-spacer-width-default": "1.33em",
  "--tree-user-select-default": "none",
  // Multi-line: set --tree-label-white-space:normal + --tree-row-align-items:flex-start
  // (with a stacked renderLabel) to get 2/3/N-line rows. Defaults = single line.
  "--tree-row-align-items-default": "center",
  "--tree-label-white-space-default": "nowrap",
} satisfies JSX.CSSProperties;

export const tok = (name: string) => `var(--tree-${name}, var(--tree-${name}-default))`;

// Token layer + per-instance indent pins — spread onto the rows' ancestor so the
// --tree-* tokens inherit down. A view concern (styling), kept out of the controller.
export const buildContainerVars = (basePadding?: number, indentStep?: number): JSX.CSSProperties => ({
  ...STYLE_DEFAULTS,
  ...(basePadding != null ? { "--tree-indent-base": `${basePadding}px` } : {}),
  ...(indentStep != null ? { "--tree-indent-step": `${indentStep}px` } : {}),
});
