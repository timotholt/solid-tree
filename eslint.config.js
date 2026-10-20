import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".test-dist/**", "node_modules/**", "examples/**", "supabase/**", "coverage/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Existing code uses `any` at the Supabase/virtualizer seams; tightened in Phase 3 (D8).
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // PLAN §2.1: the core is framework-free.
    files: ["src/core/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["solid-js", "solid-js/*", "@tanstack/*", "@supabase/*"] }],
    },
  }
);
