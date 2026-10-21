import { createSignal } from "solid-js";
import { Tree, type TreeNodeData } from "@timotholt/solid-tree";
import type { ExampleCheck, ExampleMeta } from "../example.js";

export const meta: ExampleMeta = {
  order: 6,
  title: "Theming and custom rows",
  description:
    "Every look is a --tree-* CSS custom property: set it on any ancestor. Try live overrides of font size, indent and the selected-row color, the data-density=\"compact\" preset and a data-theme light/dark wrapper, plus two-line rows via renderLabel.",
  tags: ["theming", "tokens", "density", "dark mode", "renderLabel"],
};

const data: TreeNodeData<{ detail: string }>[] = [
  {
    id: "inbox",
    label: "Inbox",
    type: "folder",
    payload: { detail: "3 unread · updated 2 min ago" },
    children: [
      { id: "m1", label: "Quarterly report", type: "mail", payload: { detail: "Dana — The numbers for Q3 are in, and they look better than expected." } },
      { id: "m2", label: "Lunch on Friday?", type: "mail", payload: { detail: "Sam — Thinking tacos. Let me know by Thursday." } },
    ],
  },
  { id: "sent", label: "Sent", type: "folder", payload: { detail: "128 messages" }, children: [{ id: "m3", label: "Re: Invoice", type: "mail", payload: { detail: "You — Paid, thanks!" } }] },
];

const ACCENTS = { blue: "rgba(37, 99, 235, 0.18)", green: "rgba(22, 163, 74, 0.2)", amber: "rgba(217, 119, 6, 0.22)" };
type Accent = keyof typeof ACCENTS;

export default function Theming() {
  const [fontSize, setFontSize] = createSignal(13);
  const [indent, setIndent] = createSignal(16);
  const [accent, setAccent] = createSignal<Accent>("blue");
  const [compact, setCompact] = createSignal(false);
  const [dark, setDark] = createSignal(false);
  const [selected, setSelected] = createSignal<string | null>("m1");

  return (
    <div>
      <div class="toolbar">
        <label>
          Font size{" "}
          <input type="range" min="10" max="20" value={fontSize()} data-testid="font-size" onInput={(e) => setFontSize(+e.currentTarget.value)} />
        </label>
        <label>
          Indent{" "}
          <input type="range" min="0" max="40" value={indent()} data-testid="indent" onInput={(e) => setIndent(+e.currentTarget.value)} />
        </label>
        <label>
          Selected row{" "}
          <select value={accent()} data-testid="accent" onInput={(e) => setAccent(e.currentTarget.value as Accent)}>
            <option value="blue">blue</option>
            <option value="green">green</option>
            <option value="amber">amber</option>
          </select>
        </label>
        <button type="button" aria-pressed={compact()} data-testid="compact" onClick={() => setCompact(!compact())}>
          Compact
        </button>
        <button type="button" aria-pressed={dark()} data-testid="dark" onClick={() => setDark(!dark())}>
          Dark
        </button>
      </div>

      {/* Tokens inherit, so this wrapper themes every tree inside it. */}
      <div
        data-testid="themed"
        data-density={compact() ? "compact" : undefined}
        data-theme={dark() ? "dark" : "light"}
        style={{
          "--tree-font-size": `${fontSize()}px`,
          "--tree-indent-step": `${indent()}px`,
          "--tree-row-active-bg": ACCENTS[accent()],
          // Multi-line rows: let labels wrap and align row contents to the top.
          "--tree-label-white-space": "normal",
          "--tree-row-align-items": "flex-start",
          background: dark() ? "#1d2027" : "#ffffff",
          color: dark() ? "#e7e9ee" : "#1f2430",
          padding: "8px",
          "border-radius": "8px",
          "max-width": "420px",
        }}
      >
        <Tree
          data={data}
          ariaLabel="Mailboxes"
          selectedId={selected()}
          onSelect={(n) => setSelected(n.id)}
          renderLabel={(node) => (
            <span style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
              <span>{node.label}</span>
              <span class="detail" style={{ "font-size": "0.85em", opacity: 0.8, "font-weight": 400 }}>
                {node.payload?.detail}
              </span>
            </span>
          )}
        />
      </div>
      <p class="muted">
        Note: the compact preset sets its own --tree-font-size on the tree container, so it wins over the font-size slider while on.
      </p>
    </div>
  );
}

export const check: ExampleCheck = async (root, h) => {
  const $ = <E extends HTMLElement>(id: string) => root.querySelector<E>(`[data-testid="${id}"]`)!;
  const themed = $("themed");

  await h.type($("font-size"), "18");
  h.expect(themed.style.getPropertyValue("--tree-font-size")).toBe("18px");
  h.expect(getComputedStyle(h.row("inbox")).fontSize).toBe("18px");

  await h.type($("indent"), "30");
  h.expect(themed.style.getPropertyValue("--tree-indent-step")).toBe("30px");
  // Inbox opened because its child m1 is the initial selection; depth-1 rows indent by the step.
  h.expect(parseFloat(getComputedStyle(h.row("m1")).paddingLeft) - parseFloat(getComputedStyle(h.row("inbox")).paddingLeft)).toBe(30);

  await h.type($("accent"), "green");
  h.expect(themed.style.getPropertyValue("--tree-row-active-bg")).toBe(ACCENTS.green);

  // Two-line custom rows: the secondary text renders inside the treeitem and wraps.
  h.expect(h.row("m1").querySelector(".detail")!.textContent).toContain("Q3");
  h.expect(getComputedStyle(h.row("m1").querySelector(".solid-tree-label")!).whiteSpace).toBe("normal");

  await h.click($("compact"));
  h.expect(themed.getAttribute("data-density")).toBe("compact");
  h.expect($("compact").getAttribute("aria-pressed")).toBe("true");

  await h.click($("dark"));
  h.expect(themed.getAttribute("data-theme")).toBe("dark");
  h.expect(getComputedStyle(themed).backgroundColor).toBe("rgb(29, 32, 39)");
};
