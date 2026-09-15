import { type TranscriptMap } from "../schema/transcript-map.js";

export function getNodeDeletionError(map: TranscriptMap, nodeId: string): string | null {
  const node = map.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return "Node no longer exists.";
  }
  if (nodeId === map.thesisNodeId) {
    return "The thesis node cannot be deleted.";
  }
  if (map.nodes.length <= 3) {
    return "A graph must keep at least three nodes.";
  }
  const section = map.sections.find((candidate) => candidate.id === node.sectionId);
  if (section && section.nodeIds.length <= 1) {
    return "A section must keep at least one node.";
  }
  return null;
}
