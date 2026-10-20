import { Component, For, Show } from "solid-js";
import { TreeRow } from "./TreeRow.js";
import { useTree } from "./context.js";
import { TreeNodeData } from "./types.js";

// Recursive wrapper: a row plus its expanded children. <Tree> renders these.
// (Kept recursive on purpose — fine-grained, stable identity. Flattening +
// by-id keying is a virtualizer concern, handled by flattenVisible/VirtualTree.)
export const TreeBranch: Component<{ node: TreeNodeData; depth: number }> = (props) => {
  const ctx = useTree();
  const hasChildren = () => !!props.node.children && props.node.children.length > 0;
  const isExpanded = () => ctx.expanded()[props.node.id] || false;
  return (
    <>
      <TreeRow node={props.node} depth={props.depth} />
      <Show when={!props.node.isDivider && hasChildren() && isExpanded()}>
        <For each={props.node.children}>
          {(child) => <TreeBranch node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </>
  );
};
