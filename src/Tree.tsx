import { Component, For, Show } from "solid-js";
import { TreeContext } from "./context.js";
import { type TreeProps } from "./types.js";
import { createTreeState } from "./state.js";
import { TreeBranch } from "./TreeBranch.jsx";

export const Tree: Component<TreeProps> = (props) => {
  const s = createTreeState(props);

  return (
    <div
      class="solid-tree-container"
      data-searching={s.searching() ? "" : undefined}
      style={{ display: "flex", "flex-direction": "column", ...s.containerVars() }}
    >
      <TreeContext.Provider value={s.ctx}>
        <Show
          when={!s.noMatches()}
          fallback={<div class="solid-tree-empty">{props.noMatchesLabel ?? "No matches"}</div>}
        >
          <For each={s.view().data}>{(node) => <TreeBranch node={node} depth={0} />}</For>
        </Show>
      </TreeContext.Provider>
    </div>
  );
};
