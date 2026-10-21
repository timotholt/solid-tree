// Tiny localStorage wrapper. SSR/quota safe (swallows + warns on error).
export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    try {
      if (typeof window === "undefined") return defaultValue;
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : defaultValue;
    } catch (error) {
      console.warn("storage.get error", error);
      return defaultValue;
    }
  },
  set: <T>(key: string, value: T): void => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("storage.set error", error);
    }
  },
  remove: (key: string): void => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn("storage.remove error", error);
    }
  },
};
