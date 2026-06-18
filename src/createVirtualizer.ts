// @ts-nocheck
// Local copy of @tanstack/solid-virtual's createVirtualizer WITH PR #1203 applied:
// the reactive update calls _willUpdate() + republishes instead of measure(), so a
// reactive `count` change (every expand/collapse) no longer discards measured row
// heights and snap rows back to estimateSize (the spacing-jitter bug). The core
// primitives are re-exported by @tanstack/solid-virtual (which re-exports
// @tanstack/virtual-core), so this needs no new dependency. Drop this once the fix
// ships upstream and bump the peer min version.
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from "@tanstack/solid-virtual";
import { mergeProps, onMount, onCleanup, createComputed, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

function createVirtualizerBase(options) {
  const resolvedOptions = mergeProps(options);
  const instance = new Virtualizer(resolvedOptions);
  const [virtualItems, setVirtualItems] = createStore(instance.getVirtualItems());
  const [totalSize, setTotalSize] = createSignal(instance.getTotalSize());
  const virtualizer = new Proxy(instance, {
    get(target, prop) {
      if (prop === "getVirtualItems") return () => virtualItems;
      if (prop === "getTotalSize") return () => totalSize();
      return Reflect.get(target, prop);
    },
  });
  virtualizer.setOptions(resolvedOptions);
  onMount(() => {
    const cleanup = virtualizer._didMount();
    virtualizer._willUpdate();
    onCleanup(cleanup);
  });
  createComputed(() => {
    virtualizer.setOptions(
      mergeProps(resolvedOptions, options, {
        onChange: (inst, sync) => {
          inst._willUpdate();
          setVirtualItems(reconcile(inst.getVirtualItems(), { key: "index" }));
          setTotalSize(inst.getTotalSize());
          options.onChange?.(inst, sync);
        },
      })
    );
    // PR #1203: was virtualizer.measure() — that cleared measured sizes on every
    // reactive option change. _willUpdate() runs the normal lifecycle, preserving them.
    virtualizer._willUpdate();
    setVirtualItems(reconcile(instance.getVirtualItems(), { key: "index" }));
    setTotalSize(instance.getTotalSize());
  });
  return virtualizer;
}

export function createVirtualizer(options) {
  return createVirtualizerBase(
    mergeProps({ observeElementRect, observeElementOffset, scrollToFn: elementScroll }, options)
  );
}
