# @timotholt/solid-tree — examples

Live gallery that doubles as **visual test** and **usage docs**. Each card shows
the rendered `<Tree>` next to the exact source that produced it.

Covers: nesting / expand-collapse / persistence, icons + counts, badges & actions
(`renderActionNode`), custom labels (`renderLabel`), dividers + the `action`
variant, and indentation / `storagePrefix` / `onToggle`.

```bash
npm install      # links the package via "@timotholt/solid-tree": "file:.."
npm run dev      # http://localhost:5180
npm run build    # type/compile check (proves the package resolves)
```

The example app consumes the local package through its `file:..` dependency and
the `solid` export condition — i.e. the same path a real consumer hits.
