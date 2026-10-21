import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Packs the library exactly as npm would publish it, installs the tarball into a
// throwaway consumer (peers symlinked from this repo), then checks what a real
// consumer would hit: every subpath resolves, type-checks without a custom
// "solid" condition, and imports in plain Node without `window` (PLAN P1, C1/C3).
// Requires `npm run build` first (the gate runs it before this project).

const root = resolve(__dirname, "../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const subpaths = Object.keys(pkg.exports).filter((k) => !k.endsWith(".css"));
const specifiers = subpaths.map((s) => (s === "." ? pkg.name : `${pkg.name}/${s.slice(2)}`));
const peers = Object.keys(pkg.peerDependencies);

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "solid-tree-consumer-"));
  const tgz = execFileSync("npm", ["pack", "--silent", "--pack-destination", dir], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .at(-1)!;
  const target = join(dir, "node_modules", ...pkg.name.split("/"));
  mkdirSync(target, { recursive: true });
  execFileSync("tar", ["-xzf", join(dir, tgz), "-C", target, "--strip-components=1"]);
  for (const peer of [...peers, "solid-js"]) {
    const link = join(dir, "node_modules", ...peer.split("/"));
    mkdirSync(resolve(link, ".."), { recursive: true });
    try {
      symlinkSync(join(root, "node_modules", ...peer.split("/")), link, "dir");
    } catch {
      /* already linked */
    }
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("published package", () => {
  it("contains dist (compiled entries + declarations) and src", () => {
    const listing = execFileSync("tar", ["-tzf", execFileSync("ls", [dir], { encoding: "utf8" }).split("\n").find((f) => f.endsWith(".tgz"))!], {
      cwd: dir,
      encoding: "utf8",
    });
    for (const entry of ["dist/index.js", "dist/index.d.ts", "dist/virtual.js", "dist/database.js", "dist/supabase.js", "src/index.tsx", "src/theme.css"]) {
      expect(listing).toContain(`package/${entry}`);
    }
  });

  it.each(specifiers)("imports %s in plain Node without window", (spec) => {
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `const m = await import(${JSON.stringify(spec)}); console.log(Object.keys(m).length, typeof window);`],
      { cwd: dir, encoding: "utf8" }
    ).trim();
    const [count, win] = out.split(" ");
    expect(Number(count)).toBeGreaterThan(0);
    expect(win).toBe("undefined");
  });

  const serverRender = (selectedId: string | null) => {
    const script = `
      import { renderToString, createComponent } from "solid-js/web";
      import { Tree } from ${JSON.stringify(pkg.name)};
      const data = [{ id: "a", label: "Apple", type: "t", children: [{ id: "b", label: "Banana", type: "t" }] }];
      console.log(renderToString(() => createComponent(Tree, { data, onSelect() {}, selectedId: ${JSON.stringify(selectedId)}, ariaLabel: "Fruit" })));
    `;
    return execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: dir, encoding: "utf8" });
  };

  it("renders <Tree> to HTML on the server (node condition → SSR build)", () => {
    const html = serverRender(null);
    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-label="Fruit"');
    expect(html).toContain("Apple");
  });

  it("regression(G8): a server render reveals the selection's ancestors like the client does", () => {
    expect(serverRender("b")).toContain("Banana");
  });

  it("type-checks imports from every subpath without the solid condition", () => {
    const src = specifiers.map((s, i) => `import * as m${i} from ${JSON.stringify(s)};\nvoid m${i};`).join("\n");
    writeFileSync(join(dir, "index.ts"), src + "\nimport type { TreeNodeData } from " + JSON.stringify(pkg.name) + ";\nconst n: TreeNodeData = { id: 'a', label: 'A', type: 't' };\nvoid n;\n");
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "bundler", target: "ESNext", strict: true, noEmit: true, skipLibCheck: true, jsx: "preserve", jsxImportSource: "solid-js" },
        files: ["index.ts"],
      })
    );
    const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
    expect(() => execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" })).not.toThrow();
  });
});

describe("solid-condition source is self-contained", () => {
  it("every relative import in the shipped src/ resolves inside the tarball", () => {
    const listing = execFileSync("tar", ["-tzf", execFileSync("ls", [dir], { encoding: "utf8" }).split("\n").find((f) => f.endsWith(".tgz"))!], { cwd: dir, encoding: "utf8" })
      .split("\n")
      .map((l) => l.replace(/^package\//, ""));
    const files = new Set(listing);
    const missing: string[] = [];
    for (const f of listing.filter((l) => /^src\/.*\.tsx?$/.test(l))) {
      const text = readFileSync(join(dir, "node_modules", ...pkg.name.split("/"), f), "utf8");
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
        const spec = m[1].replace(/\?raw$/, "");
        const base = join(f, "..", spec).replace(/\\/g, "/");
        const candidates = [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx")];
        if (!candidates.some((c) => files.has(c))) missing.push(`${f} → ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
