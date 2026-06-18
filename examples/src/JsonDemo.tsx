// JSON Explorer (?json) — a DIFFERENT use of <VirtualTree>: turn a big JSON value into
// an expandable, windowed tree. Custom renderLabel (key + typed, color-coded value),
// search across keys AND values via a custom matcher. ~14k nodes, only ~25 in the DOM.
import { createSignal, type Component, type JSX } from "solid-js";
import { VirtualTree } from "@timotholt/solid-tree/virtual";
import type { TreeNodeData } from "@timotholt/solid-tree/virtual";
import "@timotholt/solid-tree/theme.css";

// A sizeable sample so virtualization is real: 1500 users with nested fields.
const sample = {
  meta: { generated: "2026-06-18", version: 3, ok: true, note: null },
  users: Array.from({ length: 1500 }, (_, i) => ({
    id: i,
    name: `User ${String(i).padStart(4, "0")}`,
    active: i % 2 === 0,
    score: Number(((i * 37) % 1000) / 10),
    tags: [`tag-${i % 5}`, `tag-${i % 3}`],
    address: { city: `City ${i % 50}`, zip: 10000 + i },
  })),
};

const kindOf = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

// Convert any JSON value into a tree node. Containers → groups; primitives → leaves
// carrying their raw value on payload (so the matcher + renderLabel can read it).
function toNode(value: unknown, key: string, path: string): TreeNodeData {
  const kind = kindOf(value);
  if (kind === "array") {
    const arr = value as unknown[];
    return {
      id: path, label: key, type: "array",
      payload: { kind, summary: `[${arr.length}]` },
      children: arr.map((v, i) => toNode(v, String(i), `${path}.${i}`)),
    };
  }
  if (kind === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      id: path, label: key, type: "object",
      payload: { kind, summary: `{${entries.length}}` },
      children: entries.map(([k, v]) => toNode(v, k, `${path}.${k}`)),
    };
  }
  return { id: path, label: key, type: "value", payload: { leaf: true, kind, value } };
}

const COLOR: Record<string, string> = {
  string: "#16a34a", number: "#0891b2", boolean: "#9333ea", null: "#9ca3af",
};
const display = (kind: string, v: unknown) =>
  kind === "string" ? `"${v}"` : kind === "null" ? "null" : String(v);

const renderLabel = (n: TreeNodeData): JSX.Element => {
  const p = n.payload ?? {};
  if (p.leaf) {
    return (
      <span>
        <span style="color:#475569">{n.label}</span>
        <span style="color:#94a3b8">: </span>
        <span style={`color:${COLOR[p.kind] ?? "#111"}`}>{display(p.kind, p.value)}</span>
      </span>
    );
  }
  return (
    <span>
      <span style="color:#475569;font-weight:600">{n.label}</span>
      <span style="color:#cbd5e1;margin-left:6px;font-size:.9em">{p.summary}</span>
    </span>
  );
};

// Match a key OR its stringified value (so searching "true" / "City 12" / "score" works).
const matcher = (n: TreeNodeData, q: string) => {
  const s = q.toLowerCase();
  if (n.label.toLowerCase().includes(s)) return true;
  const v = n.payload?.value;
  return v != null && String(v).toLowerCase().includes(s);
};

export const JsonDemo: Component = () => {
  const root = [toNode(sample, "root", "$")];
  const [q, setQ] = createSignal("");
  const [domRows, setDomRows] = createSignal(0);

  return (
    <div style="font-family:system-ui;padding:16px;max-width:560px">
      <h2>JSON Explorer</h2>
      <p style="font-size:13px;color:#555">
        A big JSON value (1500 users → ~14k nodes) rendered as a windowed
        <code> &lt;VirtualTree&gt;</code> — custom <code>renderLabel</code> color-codes typed
        values, and a custom <code>matcher</code> searches keys <em>and</em> values. Only{" "}
        <strong>{domRows()}</strong> rows in the DOM. Try searching <code>City 12</code>,{" "}
        <code>true</code>, or <code>score</code>.
      </p>
      <input
        type="text"
        placeholder="search keys + values…"
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        style="width:100%;box-sizing:border-box;padding:6px 8px;margin-bottom:8px;font-size:13px"
      />
      <div style="height:460px;border:1px solid #ccc;border-radius:8px;font-family:ui-monospace,Menlo,monospace;--tree-font-size:12px;--text-muted:#8a8f98;--border-subtle:rgba(0,0,0,.12);--tree-row-active-bg:rgba(59,130,246,.14)">
        <VirtualTree
          data={root}
          searchQuery={q()}
          matcher={matcher}
          renderLabel={renderLabel}
          onSelect={() => {}}
          onRangeChange={(s, e) => setDomRows(e - s + 1)}
        />
      </div>
    </div>
  );
};
