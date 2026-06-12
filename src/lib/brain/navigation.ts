import { useStore } from "../../store";

/** Jump to a node anywhere in the vault: switch project/canvas if needed,
 * then let the canvas center+select it via pendingFocusNodeId. */
export async function jumpToNode(nodeId: string, canvasId?: string, projectId?: string): Promise<void> {
  const s = useStore.getState();
  s.setPendingFocusNodeId(nodeId);
  if (projectId && projectId !== s.activeProjectId) {
    await s.loadCanvases(projectId);
  }
  if (canvasId && canvasId !== useStore.getState().activeCanvasId) {
    s.setActiveCanvas(canvasId);
  }
}
