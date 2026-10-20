# Changelog

All notable changes are listed here. While on 0.x, a minor version may contain
breaking changes; they are always marked **Breaking**. Defect IDs refer to
[docs/ANALYSIS.md](docs/ANALYSIS.md).

## Unreleased

### Changed
- **Breaking:** peer minimums are now the versions the test suite verifies:
  `solid-js` ≥ 1.9.16, `@tanstack/solid-virtual` ≥ 3.13.32, `@tanstack/solid-query`
  ≥ 5.30.0, `@supabase/supabase-js` ≥ 2.45.0.
- `<VirtualTree>` uses upstream `@tanstack/solid-virtual` (≥ 3.13.32 contains the
  measurement fix the package used to fork). The fork is deleted (C2).
- Source imports use `.js` specifiers instead of `.jsx`, so bundlers other than Vite can
  compile the `solid`-condition source (C4).

### Added
- `node` export condition with a server-compiled build (`dist/server/`): the package
  imports in Node and renders to HTML without hydration (C3).
- `prepare` script: git installs now build `dist/`, so the `import` entry and type
  declarations exist for git consumers (C1).
- LICENSE file (C7).
- Test harness (Vitest unit, DOM and real-browser projects), CI, packaging checks
  (tarball consumer, publint, attw) and bundle-size budgets.

## 0.16.0 and earlier

See the git tags.
