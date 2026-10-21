export { VirtualTree } from "./view/VirtualTree.js";
export type { VirtualTreeProps } from "./view/VirtualTree.js";
export { createTreeController } from "./controller/index.js";
export type { TreeController, TreeControllerOptions } from "./controller/index.js";
// Re-export the shared surface so `/virtual` consumers don't need both entry points.
export type { TreeNodeData, TreeProps, TreeMatcher, TreeRowClickPolicy, FlatRow } from "./types.js";
export { moveNodes } from "./moveNodes.js";
