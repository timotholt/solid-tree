import type { Row } from "./flatten.js";

/** What a key press should do. Fields are independent; any may be set. */
export interface KeyAction {
  focusId?: string;
  toggleId?: string;
  /** Expand these ids (the "*" key). */
  expandIds?: string[];
  selectId?: string;
}

export interface KeyOptions {
  /** Right-to-left layout: ArrowLeft and ArrowRight swap meaning. */
  rtl?: boolean;
  /** Disabled nodes stay focusable (WAI-ARIA default) but cannot be selected. */
  isDisabled?: (id: string) => boolean;
  /** Skip disabled nodes entirely when moving focus. Default false. */
  skipDisabled?: boolean;
}

/**
 * Resolve one WAI-ARIA tree key against the visible rows. Returns `null` for keys the
 * tree does not handle (so the event can propagate), `{}` for handled keys that do
 * nothing at a boundary.
 */
export function resolveKey(key: string, currentId: string, rows: readonly Row[], opts: KeyOptions = {}): KeyAction | null {
  const disabled = opts.isDisabled ?? (() => false);
  const nav = rows.filter((r) => r.kind === "node" && !(opts.skipDisabled && disabled(r.id)));
  const index = nav.findIndex((r) => r.id === currentId);
  if (index < 0) return null;
  const current = nav[index];
  const focusAt = (i: number): KeyAction => (nav[i] ? { focusId: nav[i].id } : {});

  let k = key;
  if (opts.rtl && (k === "ArrowLeft" || k === "ArrowRight")) k = k === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";

  switch (k) {
    case "ArrowDown":
      return focusAt(index + 1);
    case "ArrowUp":
      return focusAt(index - 1);
    case "Home":
      return focusAt(0);
    case "End":
      return focusAt(nav.length - 1);
    case "ArrowRight":
      if (!current.hasChildren) return {};
      if (!current.expanded) return { toggleId: current.id };
      return nav[index + 1] && nav[index + 1].parentId === current.id ? { focusId: nav[index + 1].id } : {};
    case "ArrowLeft": {
      if (current.hasChildren && current.expanded) return { toggleId: current.id };
      const parent = current.parentId === null ? undefined : nav.find((r) => r.id === current.parentId);
      return parent ? { focusId: parent.id } : {};
    }
    case "*": {
      const expandIds = rows
        .filter((r) => r.kind === "node" && r.parentId === current.parentId && r.hasChildren && !r.expanded)
        .map((r) => r.id);
      return expandIds.length ? { expandIds } : {};
    }
    case "Enter":
    case " ":
    case "Spacebar":
      return disabled(current.id) ? {} : { selectId: current.id };
    default:
      return null;
  }
}

/** Type-ahead buffer state (pure; the caller keeps it between key presses). */
export interface TypeaheadState {
  readonly buffer: string;
  readonly at: number;
}

export const TYPEAHEAD_RESET_MS = 500;

/** True for keys that should feed type-ahead (one printable character, no modifiers). */
export const isTypeaheadKey = (e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) =>
  e.key.length === 1 && e.key !== " " && e.key !== "*" && !e.ctrlKey && !e.metaKey && !e.altKey;

/**
 * Feed one character. Typing the same character repeatedly cycles through rows that
 * start with it; typing a word jumps to the first row (after the current one, wrapping)
 * whose label starts with the buffer. Case-insensitive.
 */
export function typeahead(
  state: TypeaheadState | null,
  char: string,
  now: number,
  rows: readonly Row[],
  currentId: string,
  labelOf: (id: string) => string,
  resetMs = TYPEAHEAD_RESET_MS
): { state: TypeaheadState; focusId?: string } {
  const fresh = !state || now - state.at > resetMs;
  const prev = fresh ? "" : state!.buffer;
  const c = char.toLowerCase();
  const repeating = prev.length > 0 && [...prev].every((x) => x === c);
  const buffer = repeating ? c : prev + c;
  const nav = rows.filter((r) => r.kind === "node");
  const start = nav.findIndex((r) => r.id === currentId);
  // A single (or repeated) character searches from the NEXT row; a growing word
  // re-checks the current row first, so "ap" stays on "apple" after "a".
  const offset = buffer.length === 1 ? 1 : 0;
  for (let step = 0; step < nav.length; step++) {
    const r = nav[(start + offset + step + nav.length) % nav.length];
    if (labelOf(r.id).toLowerCase().startsWith(buffer)) return { state: { buffer: repeating ? prev + c : buffer, at: now }, focusId: r.id };
  }
  return { state: { buffer: repeating ? prev + c : buffer, at: now } };
}
