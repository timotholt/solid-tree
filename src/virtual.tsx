export { VirtualTree } from "./VirtualTree.jsx";
export type { VirtualTreeProps } from "./VirtualTree.jsx";
export { createTreeController } from "./controller.js";
export type { TreeController, TreeControllerOptions } from "./controller.js";
// Re-export the shared surface so `/virtual` consumers don't need both entry points.
export type { TreeNodeData, TreeProps, TreeMatcher, FlatRow } from "./types.js";
