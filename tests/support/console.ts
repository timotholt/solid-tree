// Captures console.warn/error so the global afterEach can fail on unexpected output.
// A test that expects output calls expectConsole() to claim matching entries.

interface Entry {
  level: "warn" | "error";
  text: string;
}

let entries: Entry[] = [];

const format = (args: unknown[]) =>
  args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : safeJson(a))).join(" ");

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

for (const level of ["warn", "error"] as const) {
  console[level] = (...args: unknown[]) => {
    entries.push({ level, text: format(args) });
  };
}

/** Claim (and remove) captured entries matching `pattern`. Returns how many matched. */
export function expectConsole(level: Entry["level"], pattern: RegExp): number {
  const before = entries.length;
  entries = entries.filter((e) => !(e.level === level && pattern.test(e.text)));
  return before - entries.length;
}

/** Drain everything not yet claimed. */
export function consumeConsole(): Entry[] {
  const left = entries;
  entries = [];
  return left;
}
