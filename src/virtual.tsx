export { VirtualTree } from "./VirtualTree.js";
export type { VirtualTreeProps } from "./VirtualTree.js";
export { createTreeController } from "./controller.js";
export type { TreeController, TreeControllerOptions } from "./controller.js";
// Re-export the shared surface so `/virtual` consumers don't need both entry points.
export type { TreeNodeData, TreeProps, TreeMatcher, TreeRowClickPolicy, FlatRow } from "./types.js";
