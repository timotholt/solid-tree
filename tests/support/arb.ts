import fc from "fast-check";

export interface GNode {
  id: string;
  label: string;
  children?: GNode[];
  isDivider?: boolean;
}

/**
 * Random forest with unique ids. Node i picks a parent among earlier nodes (or root),
 * so any shape is reachable. Some leaves become separators.
 */
export const arbForest = (maxNodes = 40) =>
  fc
    .array(
      fc.record({
        parent: fc.nat(),
        label: fc.stringMatching(/^[abc]{1,3}$/),
        sep: fc.boolean(),
        rootBias: fc.boolean(),
      }),
      { minLength: 1, maxLength: maxNodes }
    )
    .map((specs) => {
      const nodes: GNode[] = specs.map((s, i) => ({ id: `n${i}`, label: s.label }));
      const roots: GNode[] = [];
      specs.forEach((s, i) => {
        if (i === 0 || s.rootBias) roots.push(nodes[i]);
        else {
          const p = nodes[s.parent % i];
          (p.children ??= []).push(nodes[i]);
        }
      });
      // Separators only on leaves, and only in sibling lists with something else.
      specs.forEach((s, i) => {
        if (s.sep && !nodes[i].children) nodes[i].isDivider = true;
      });
      return roots;
    });

// ── naive reference implementations (the oracle) ────────────────────────────────

export function naivePreorder(roots: GNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: GNode[]) => ns.forEach((n) => (out.push(n.id), n.children && walk(n.children)));
  walk(roots);
  return out;
}

export function naiveParents(roots: GNode[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  const walk = (ns: GNode[], p: string | null) => ns.forEach((n) => (m.set(n.id, p), n.children && walk(n.children, n.id)));
  walk(roots, null);
  return m;
}

/** Visible ids with all nodes collapsed except those in `open`. */
export function naiveVisible(roots: GNode[], open: Set<string>, keep?: (id: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (ns: GNode[]) => {
    for (const n of ns) {
      if (keep && !keep(n.id)) continue;
      out.push(n.id);
      const kids = (n.children ?? []).filter((c) => !keep || keep(c.id));
      if (kids.length && open.has(n.id)) walk(n.children!);
    }
  };
  walk(roots);
  return out;
}
