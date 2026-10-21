import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { STYLE_DEFAULTS } from "../../src/view/tokens.js";

// Docs must not drift from the source (ANALYSIS C7). The token table in the theming guide
// is generated from STYLE_DEFAULTS; UPDATE_DOCS=1 rewrites it.
const guide = resolve(import.meta.dirname, "../../docs/guide/theming.md");
const table = () =>
  [
    "| Token | Default |",
    "|---|---|",
    ...Object.entries(STYLE_DEFAULTS).map(([k, v]) => `| \`${k.replace(/-default$/, "")}\` | \`${v}\` |`),
  ].join("\n");

describe("docs", () => {
  it("the theming guide's token table matches src/view/tokens.ts", () => {
    const text = readFileSync(guide, "utf8");
    const re = /<!-- tokens:start -->\n([\s\S]*?)\n<!-- tokens:end -->/;
    if (process.env.UPDATE_DOCS) {
      writeFileSync(guide, text.replace(re, `<!-- tokens:start -->\n${table()}\n<!-- tokens:end -->`));
      return;
    }
    expect(re.exec(text)?.[1]).toBe(table());
  });

  it("theme.css does not document a default that tokens.ts disagrees with", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../src/theme.css"), "utf8");
    for (const [k, v] of Object.entries(STYLE_DEFAULTS)) {
      const token = k.replace(/-default$/, "");
      const m = new RegExp(`${token} ([^ ·*\\n]+)`).exec(css.split("*/")[0]);
      if (m && !m[1].startsWith("(")) expect(`${token} ${m[1]}`).toBe(`${token} ${String(v).replace(/^0\./, ".")}`);
    }
  });
});
