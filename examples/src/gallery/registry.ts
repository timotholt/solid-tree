import type { Component } from "solid-js";
import type { ExampleBefore, ExampleCheck, ExampleMeta } from "../example.js";

interface Module {
  meta: ExampleMeta;
  default: Component;
  check?: ExampleCheck;
  before?: ExampleBefore;
}

const modules = import.meta.glob<Module>("../examples/*.tsx", { eager: true });
const sources = import.meta.glob<string>("../examples/*.tsx", { eager: true, query: "?raw", import: "default" });

export interface Entry {
  slug: string;
  meta: ExampleMeta;
  Component: Component;
  source: string;
  file: string;
  check?: ExampleCheck;
  before?: ExampleBefore;
}

export const entries: Entry[] = Object.entries(modules)
  .map(([path, mod]) => {
    const file = path.split("/").pop()!;
    return {
      slug: file.replace(/\.tsx$/, ""),
      meta: mod.meta,
      Component: mod.default,
      source: sources[path] ?? "",
      file,
      check: mod.check,
      before: mod.before,
    };
  })
  .sort((a, b) => a.meta.order - b.meta.order);
