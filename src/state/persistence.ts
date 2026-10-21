import { storage } from "./storage.js";

/** Where expansion state is remembered. `load` runs once, synchronously, at creation. */
export interface PersistenceAdapter {
  load(): string[] | null;
  save(ids: string[]): void;
}

/**
 * localStorage adapter. Reads and writes the historical `Record<id, boolean>` format, so
 * state saved by earlier versions restores, and earlier versions can read ours.
 */
export function localStoragePersistence(key: string): PersistenceAdapter {
  return {
    load() {
      const raw = storage.get<unknown>(key, null);
      if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
      if (raw && typeof raw === "object") return Object.entries(raw as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k);
      return null;
    },
    save(ids) {
      storage.set(key, Object.fromEntries(ids.map((id) => [id, true])));
    },
  };
}

/** In-memory adapter (tests, or "remember for this page only"). */
export function memoryPersistence(initial: string[] = []): PersistenceAdapter & { saved: string[] } {
  const self = {
    saved: [...initial],
    load: () => [...self.saved],
    save: (ids: string[]) => {
      self.saved = [...ids];
    },
  };
  return self;
}
