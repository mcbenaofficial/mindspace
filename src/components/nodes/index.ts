// All node registration lives in registry.tsx — one entry per node type
// (component, label, icon, category, default size, default data).
export { nodeTypes, NODE_REGISTRY, CATEGORIES, getDefaultSize, getDefaultData, nodeOptionsForCategory } from "./registry";
export type { NodeDef, NodeCategory } from "./registry";
